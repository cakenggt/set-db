const EventEmitter = require('events');

const atob = require('atob');
const IPFS = require('ipfs');

class SetDB extends EventEmitter {
	constructor(topic, options) {
		super();
		this.receiveMessage = this.receiveMessage.bind(this);
		options = options || {};
		this.topic = topic;
		// Validator is a filter function
		this.validator = options.validator || (() => true);
		this.dbHash = options.dbHash;
		this.indexBy = options.indexBy || '_id';
		this.db = {};
		this.DEBUG = options.DEBUG;
		if (options.ipfs) {
			this.ipfs = options.ipfs;
			this.loadDB();
		} else {
			this.ipfs = new IPFS({
				EXPERIMENTAL: {
					pubsub: true
				}
			});
			this.ipfs.on('ready', () => {
				this.loadDB();
			});
		}
	}

	start() {
		this.ipfs.start();
	}

	stop() {
		this.ipfs.stop();
	}

	connect() {
		this.ipfs.pubsub.subscribe(this.topic, this.receiveMessage)
		.then(() => {
			this.emit('ready');

			if (this.dbHash) {
				// If they have a previously saved dbHash, send it as NEW
				this.sendMessage(JSON.stringify({
					type: 'NEW',
					data: this.dbHash
				}));
			}
			this.ask();
		})
		.catch(err => this.emit('error', err));
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
			this.upload()
			.then(hash => {
				this.emit('sync');
				this.sendMessage(JSON.stringify({
					type: 'NEW',
					data: hash
				}));
			});
		}
	}

	disconnect() {
		this.ipfs.pubsub.unsubscribe(this.topic, this.receiveMessage);
	}

	ipfsGetFile(hash) {
		return this.ipfs.files.get(hash)
		.then(files => files[0].content.toString('utf8'));
	}

	loadDB() {
		if (this.dbHash) {
			this.ipfs.files.get(this.dbHash)
			.then(files => this.addValidatedEntries(JSON.parse(files[0].content.toString('utf8'))))
			.then(() => this.connect());
		} else {
			this.connect();
		}
	}
	
	addValidatedEntries(newDB) {
		let newValues = Object.keys(newDB).map(elem => newDB[elem]);
		if (this.validator) {
			// Remove any invalid entries according to the validator
			newValues = newValues.filter(this.validator);
		}
		let added = false;
		newValues.reduce((db, elem) => {
			const id = elem[this.indexBy];
			if (id) {
				// Entry must have id
				if (!db[id]) {
					// Entry must not already be in db
					added = true;
					db[id] = elem;
				}
			}
			return db;
		}, this.db);
		return added;
	}
	
	ask() {
		this.sendMessage(JSON.stringify({
			type: 'ASK'
		}));
	}
	
	receiveMessage(message) {
		this.ipfs.id()
		.then(id => {
			if (this.DEBUG || message.from !== id.id) {
				try {
					this.dealWithParsedMessage(JSON.parse(message.data.toString()));
				} catch (err) {
					console.log('Failed at parsing data because ' + err);
				}
			}
		});
	}
	
	dealWithParsedMessage(message) {
		switch (message.type) {
			case 'NEW':
				// A new hash was published
				this.ipfsGetFile(message.data)
				.then(content => {
					let newDB = {};
					try {
						newDB = JSON.parse(content);
					} catch (err) {
						console.log(`Error in new data due to ${err}`);
					}
					const added = this.addValidatedEntries(newDB);
					if (added) {
						// If any were added, publish new db
						this.upload(this)
						.then(hash => {
							this.emit('sync');
							this.sendMessage(JSON.stringify({
								type: 'NEW',
								data: hash
							}));
						});
					}
				})
				.catch(err => {
					this.emit('error', err);
				});
				break;
			case 'ASK':
				if (this.dbHash) {
					this.sendMessage(JSON.stringify({
						type: 'NEW',
						data: this.dbHash
					}));
				}
				break;
			default:
				break;
		}
	}
	
	sendMessage(message) {
		// Message must be a string
		this.ipfs.pubsub.publish(this.topic, new Buffer(message));
	}
	
	upload() {
		// Sort and then upload, returns a promise
		const values = Object.keys(this.db).map(elem => this.db[elem]);
		values.sort((a, b) => a[this.indexBy].localeCompare(b[this.indexBy]));
		const db = values.reduce((result, elem) => {
			result[elem[this.indexBy]] = elem;
			return result;
		}, {});
		this.db = db;
		return this.ipfs.files.add([
			{
				path: 'db.json',
				content: Buffer.from(JSON.stringify(this.db))
			}
		])
		.then(files => {
			const hash = files[0].hash;
			this.dbHash = hash;
			return hash;
		})
		.catch(err => {
			this.emit('error', err);
			Promise.reject(err);
		});
	}
}



module.exports = SetDB;
