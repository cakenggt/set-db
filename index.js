const request = require('request');
const atob = require('atob');
const ipfsAPI = require('ipfs-api');

const ipfs = ipfsAPI();

const localhost = 'http://localhost:5001/api/v0/';

class SetDB {
  constructor(topic, options) {
    options = options || {};
    this.topic = topic;
    //validator is a filter function which has 'this' set to the map of the db by _id
    this.validator = options.validator;
    this.dbHash = options.dbHash;
    this.indexBy = options.indexBy || '_id';
    this.db = {};
    this.connection;
    //this.uploadDB();
    this.loadDB();
    this.subscribe();
  }

  loadDB() {
    //Default hash is an empty map
    if (this.dbHash) {
      ipfs.files.get(this.dbHash, (err, stream) => {
        stream.on('data', file => {
          if (file.content) {
            file.content.on('data', str => {
              console.log('contents are');
              console.log(str.toString());
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
    ])
    .then(res => {
      console.log(res);
    });
  }

  subscribe() {
    this.connection = request.get(`${localhost}pubsub/sub?arg=${encodeURIComponent(this.topic)}`);
    this.connection
    .on('data', this.receiveMessage)
    .on('error', console.error);
  }

  receiveMessage(message) {
    //TODO not done yet!
    console.log('new data');
    console.log(message.toString());
    var json = JSON.parse(message.toString());
    if (json.data) {
      var data = atob(json.data);
      console.log(data);
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
          if (this.validator) {
            //Remove any invalid entries according to the validator
            newDB = Object.keys(newDB).map(elem => newDB[elem]).filter(this.validator, this.db);
          }
          //NOT FINISHED
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
    var db = values.reduce((elem, result) => result[elem[this.indexBy]] = elem, {});
    this.db = db;
    return ipfs.files.add([
      {
        path: 'db.json',
        content: new Buffer(JSON.stringify(this.db))
      }
    ])
    .then(res => {
      console.log(`New db hash is: ${res[0].hash}`);
      return res[0].hash;
    });
  }

  put(elem) {
    var id = elem[this.indexBy];
    if (!this.db[id]) {
      //No entry exists in db currently
      this.db[id] = elem;
      upload()
      .then(hash => {
        this.sendMessage(JSON.stringify({
          type: 'NEW',
          data: hash
        }));
      });
    }
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
