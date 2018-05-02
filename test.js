require('leaked-handles'); // eslint-disable-line import/no-unassigned-import
const test = require('tape');
const SetDB = require('./index');
const IPFS = require('ipfs');

const network = 'test';

const node1 = new IPFS({
	config: {
		Addresses: {
			Swarm: [
			'/ip4/0.0.0.0/tcp/4002',
			'/ip4/127.0.0.1/tcp/4003/ws'
			],
			API: '/ip4/127.0.0.1/tcp/5002',
			Gateway: '/ip4/127.0.0.1/tcp/9090'
		}
	}
});

function logError(db) {
	db.on('error', err => console.log(err));
}

function generateDb(options) {
	const db = new SetDB(network, Object.assign({}, {
		DEBUG: true,
		ipfs: node1
	}, options));
	logError(db);
	return db;
};

const dbStates = {
	QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V: {
		1: {
			_id: '1',
			name: 'testname'
		}
	}
};

function afterAllEvent(dbs, event, callback) {
	const readies = [];
	dbs.forEach((db, i) => {
		readies[i] = false;
		db.on(event, () => {
			readies[i] = true;
			for (let j = 0; j < readies.length; j++) {
				if (!readies[j]) {
					return;
				}
			}
			callback();
		});
	});
}

afterAllEvent([node1], 'ready', () => {
	test('put dbs', t => {
		const db1 = generateDb();
		const db2 = generateDb();
	
		t.plan(2);
		t.deepEqual(db1.db, db2.db);
		afterAllEvent([db1, db2], 'ready', () => {
			console.log('all ready');
			db1.put({
				_id: '1',
				name: 'testname'
			});
			db2.on('sync', () => {
				console.log('sync');
				t.deepEqual(db1.db, db2.db);
				db1.disconnect();
				db2.disconnect();
			});
		});
	});
	
	test('load db', t => {
		const hash = 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V';
		const db = generateDb({
			dbHash: hash
		});
		t.plan(1);
		db.on('ready', () => {
			t.deepEqual(db.db, dbStates[hash]);
			db.disconnect();
		});
	});
	
	test('sync dbs', t => {
		const db1 = generateDb({
			dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
		});
		const db2 = generateDb();
	
		t.plan(2);
	
		afterAllEvent([db1, db2], 'ready', () => {
			db2.on('sync', () => {
				t.deepEqual(db1.db, db2.db);
				t.equal(db1.dbHash, db2.dbHash);
				db1.disconnect();
				db2.disconnect();
			});
		});
	});
	
	test('no mutate', t => {
		const db = generateDb();
	
		t.plan(1);
		db.on('ready', () => {
			const orig = {
				1: {_id: '1', name: 'a'}
			};
			db.put(orig['1']);
			orig['1'].name = 'new';
			t.notDeepEqual(db.db, orig);
			db.disconnect();
		});
	});
	
	test('hash change after put', t => {
		const db = generateDb();
	
		t.plan(1);
		const hash1 = db.dbHash;
		db.on('ready', () => {
			db.put({_id: '1', name: 'test'});
			db.on('sync', () => {
				t.notEqual(hash1, db.dbHash);
				db.disconnect();
			});
		});
	});
	
	test('ready called in new thread', t => {
		const db = generateDb();
	
		t.plan(1);
		db.on('ready', () => {
			t.pass();
			db.disconnect();
		});
	});
	
	test('first big, then small', t => {
		t.plan(1);
	
		const db2 = generateDb({
			dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
		});
		db2.on('ready', () => {
			const db1 = generateDb();
			db1.on('sync', () => {
				t.pass();
				db1.disconnect();
				db2.disconnect();
			});
		});
	});
	
	test('first small, then big', t => {
		t.plan(1);
	
		const db1 = generateDb();
		db1.on('ready', () => {
			const db2 = generateDb({
				dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
			});
			db1.on('sync', () => {
				t.pass();
				db1.disconnect();
				db2.disconnect();
			});
		});
	});
	
	test('huge put', t => {
		t.plan(1);
	
		const db1 = generateDb();
		const db2 = generateDb();
	
		let str = '';
		for (let i = 0; i < 10000; i++) {
			str += 'a';
		}
	
		afterAllEvent([db1, db2], 'ready', () => {
			db1.put({
				_id: '1',
				data: str
			});
			db2.on('sync', () => {
				t.pass();
				db1.disconnect();
				db2.disconnect();
			});
		});
	});
	
	test('huge loadDb', t => {
		t.plan(1);
	
		const db = generateDb({
			dbHash: 'QmdMFBpKZDiFV8kDT1w73cEMnpAyU1dVZpZEPri1wtqcUB'
		});
	
		db.on('ready', () => {
			t.pass();
			db.disconnect();
		});
	});
});

