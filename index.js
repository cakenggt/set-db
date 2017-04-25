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
    // Validator is a filter function
		this.validator = options.validator || (() => true);
		this.dbHash = options.dbHash;
		this.indexBy = options.indexBy || '_id';
		this.db = {};
		this.connection = null;
		loadDB(this);
		this.connect();
	}

	connect() {
		this.connection = request.get(`${localhost}pubsub/sub?arg=${encodeURIComponent(this.topic)}`);
		this.connection
    .on('data', data => receiveMessage(this, data))
    .on('error', err => this.emit('error', err));
		ask(this);
	}

	query(func) {
		return Object.keys(this.db).map(elem => Object.assign({}, this.db[elem])).filter(func);
	}

	get(id) {
		const elem = this.db[id];
		if (elem) {
			return Object.assign({}, elem);
		}
		return elem;
	}

	put(elem) {
		const id = elem[this.indexBy];
		if (!this.db[id] && this.validator(elem)) {
      // No entry exists in db currently
			this.db[id] = Object.assign({}, elem);
			upload(this)
			.then(hash => {
				this.emit('sync');
				sendMessage(this, JSON.stringify({
					type: 'NEW',
					data: hash
				}));
			});
		}
	}

	disconnect() {
		this.connection.abort();
		this.connection = null;
	}
}

function ipfsGetFile(hash) {
	return new Promise((resolve, reject) => {
		ipfs.files.get(hash, (err, stream) => {
			if (err) {
				reject(err);
			} else {
				stream.on('data', file => {
					if (file.content) {
						file.content.on('data', str => {
							resolve(str.toString());
						});
					} else {
						reject(new Error('No file content'));
					}
				});
				stream.on('error', e => {
					reject(e);
				});
			}
		});
	});
}

function loadDB(self) {
	if (self.dbHash) {
		ipfs.files.get(self.dbHash, (err, stream) => {
			if (err) {
				self.emit('error', err);
			} else {
				stream.on('data', file => {
					if (file.content) {
						file.content.on('data', str => {
							addValidatedEntries(self, JSON.parse(str.toString()));
							self.emit('ready');
						});
					}
				});
			}
		});
	} else {
		// Putting in setTimeout to add to new thread
		setTimeout(() => self.emit('ready'), 0);
	}
}

function addValidatedEntries(self, newDB) {
	let newValues = Object.keys(newDB).map(elem => newDB[elem]);
	if (self.validator) {
		// Remove any invalid entries according to the validator
		newValues = newValues.filter(self.validator);
	}
	let added = false;
	newValues.reduce((db, elem) => {
		const id = elem[self.indexBy];
		if (id) {
			// Entry must have id
			if (!db[id]) {
				// Entry must not already be in db
				added = true;
				db[id] = elem;
			}
		}
		return db;
	}, self.db);
	return added;
}

function ask(self) {
	sendMessage(self, JSON.stringify({
		type: 'ASK'
	}));
}

function receiveMessage(self, message) {
	const json = JSON.parse(message.toString());
	if (json.data) {
		const data = atob(json.data);
		try {
			const parsedData = JSON.parse(data);
			dealWithParsedMessage(self, parsedData);
		} catch (err) {
			console.log('Failed at parsing data because ' + err);
		}
	}
}

function dealWithParsedMessage(self, message) {
	switch (message.type) {
		case 'NEW':
			// A new hash was published
			ipfsGetFile(message.data)
			.then(content => {
				let newDB = {};
				try {
					newDB = JSON.parse(content);
				} catch (err) {
					console.log(`Error in new data due to ${err}`);
				}
				const added = addValidatedEntries(self, newDB);
				if (added) {
					// If any were added, publish new db
					upload(self)
					.then(hash => {
						self.emit('sync');
						sendMessage(self, JSON.stringify({
							type: 'NEW',
							data: hash
						}));
					});
				}
			})
			.catch(err => {
				self.emit('error', err);
			});
			break;
		case 'ASK':
			if (self.dbHash) {
				sendMessage(self, JSON.stringify({
					type: 'NEW',
					data: self.dbHash
				}));
			}
			break;
		default:
			break;
	}
}

function sendMessage(self, message) {
	// Message must be a string
	request.get(`${localhost}pubsub/pub?arg=${encodeURIComponent(self.topic)}&arg=${encodeURIComponent(message)}`);
}

function upload(self) {
	// Sort and then upload, returns a promise
	const values = Object.keys(self.db).map(elem => self.db[elem]);
	values.sort((a, b) => a[self.indexBy].localeCompare(b[self.indexBy]));
	const db = values.reduce((result, elem) => {
		result[elem[self.indexBy]] = elem;
		return result;
	}, {});
	self.db = db;
	return ipfs.files.add([
		{
			path: 'db.json',
			content: Buffer.from(JSON.stringify(self.db))
		}
	])
	.then(res => {
		const hash = res[0].hash;
		self.dbHash = hash;
		return hash;
	})
	.catch(err => {
		self.emit('error', err);
	});
}

module.exports = SetDB;
