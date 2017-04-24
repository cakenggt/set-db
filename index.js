const EventEmitter = require('events');

const request = require('request');
const atob = require('atob');
const ipfsAPI = require('ipfs-api');

const ipfs = ipfsAPI();

const localhost = 'http://localhost:5001/api/v0/';

class SetDB extends EventEmitter {
  constructor(topic, options) {
    super();
    options = options || {};
    this.topic = topic;
    //validator is a filter function
    this.validator = options.validator || (elem => true);
    this.dbHash = options.dbHash;
    this.indexBy = options.indexBy || '_id';
    this.db = {};
    this.connection;
    this.loadDB();
    this.subscribe();
  }

  loadDB() {
    if (this.dbHash) {
      ipfs.files.get(this.dbHash, (err, stream) => {
        stream.on('data', file => {
          if (file.content) {
            file.content.on('data', str => {
              this.db = JSON.parse(str.toString());
            });
          }
        })
      });
    }
  }

  uploadDB() {
    ipfs.files.add([
      {
        path: 'db.json',
        content: new Buffer(JSON.stringify(this.db))
      }
    ]);
  }

  subscribe() {
    this.connection = request.get(`${localhost}pubsub/sub?arg=${encodeURIComponent(this.topic)}`);
    this.connection
    .on('data', this.receiveMessage.bind(this))
    .on('error', console.error);
  }

  receiveMessage(message) {
    var json = JSON.parse(message.toString());
    if (json.data) {
      var data = atob(json.data);
      try {
        var parsedData = JSON.parse(data);
        this.dealWithParsedMessage(parsedData);
      } catch (e) {
        console.log('Failed at parsing data because ' + e);
      }
    }
  }

  dealWithParsedMessage(message) {
    switch(message.type) {
      case 'NEW':
        //A new hash was published
        ipfsGetFile(message.data)
        .then(content => {
          var newDB = {};
          try {
            newDB = JSON.parse(content);
          } catch (e) {
            console.log(`Error in new data due to ${e}`);
          }
          var newValues = Object.keys(newDB).map(elem => newDB[elem]);
          if (this.validator) {
            //Remove any invalid entries according to the validator
            newValues = newValues.filter(this.validator);
          }
          var added = false;
          newValues.reduce((db, elem) => {
            var id = elem[this.indexBy];
            if (!db[id]) {
              added = true;
              db[id] = elem;
            }
            return db;
          }, this.db);
          if (added) {
            this.emit('sync');
            //If any were added, publish new db
            this.upload()
            .then(hash => {
              this.sendMessage(JSON.stringify({
                type: 'NEW',
                data: hash
              }));
            });
          }
        });
    }
  }

  query(func) {
    return Object.keys(this.db).map(elem => this.db[elem]).filter(func);
  }

  sendMessage(message) {
    //message must be a string
    request.get(`${localhost}pubsub/pub?arg=${encodeURIComponent(this.topic)}&arg=${encodeURIComponent(message)}`);
  }

  upload() {
    //sort and then upload, returns a promise
    var values = Object.keys(this.db).map(elem => this.db[elem]);
    values.sort((a, b) => a[this.indexBy].localeCompare(b[this.indexBy]));
    var db = values.reduce((result, elem) => {
      result[elem[this.indexBy]] = elem;
      return result;
    }, {});
    this.db = db;
    return ipfs.files.add([
      {
        path: 'db.json',
        content: new Buffer(JSON.stringify(this.db))
      }
    ])
    .then(res => {
      var hash = res[0].hash;
      this.dbHash = hash;
      return hash;
    });
  }

  put(elem) {
    var id = elem[this.indexBy];
    if (!this.db[id] && this.validator(elem)) {
      //No entry exists in db currently
      this.db[id] = elem;
      this.upload()
      .then(hash => {
        this.sendMessage(JSON.stringify({
          type: 'NEW',
          data: hash
        }));
      });
    }
  }

  stop() {
    this.connection.abort();
    this.connection = null;
  }
}

function ipfsGetFile(hash) {
  return new Promise((resolve, reject) => {
    ipfs.files.get(hash, (err, stream) => {
      stream.on('data', file => {
        if (file.content) {
          file.content.on('data', str => {
            resolve(str.toString());
          });
        } else {
          reject('No file content');
        }
      });
      stream.on('error', e => {
        reject(e);
      });
    });
  })
}

module.exports = SetDB;
