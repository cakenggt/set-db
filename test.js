require('leaked-handles'); // eslint-disable-line import/no-unassigned-import
const test = require('tape');
const SetDB = require('./index');

const network = 'test';

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

test('put dbs', t => {
	const db1 = new SetDB(network);
	const db2 = new SetDB(network);

	t.plan(2);
	t.deepEqual(db1.db, db2.db);
	afterAllEvent([db1, db2], 'ready', () => {
		db1.put({
			_id: '1',
			name: 'testname'
		});
		db2.on('sync', () => {
			t.deepEqual(db1.db, db2.db);
			db1.disconnect();
			db2.disconnect();
		});
	});
});

test('load db', t => {
	const hash = 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V';
	const db = new SetDB(network, {
		dbHash: hash
	});
	t.plan(1);
	db.on('ready', () => {
		t.deepEqual(db.db, dbStates[hash]);
		db.disconnect();
	});
});

test('sync dbs', t => {
	const db1 = new SetDB(network, {
		dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
	});
	const db2 = new SetDB(network);

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
	const db1 = new SetDB(network);

	t.plan(1);
	db1.on('ready', () => {
		const orig = {
			1: {_id: '1', name: 'a'}
		};
		db1.put(orig['1']);
		orig['1'].name = 'new';
		t.notDeepEqual(db1.db, orig);
		db1.disconnect();
	});
});

test('hash change after put', t => {
	const db = new SetDB(network);

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
	const db = new SetDB(network);

	t.plan(1);
	db.on('ready', () => {
		t.pass();
		db.disconnect();
	});
});

test('first big, then small', t => {
	t.plan(1);

	const db2 = new SetDB(network, {
		dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
	});
	db2.on('ready', () => {
		const db1 = new SetDB(network);
		db1.on('sync', () => {
			t.pass();
			db1.disconnect();
			db2.disconnect();
		});
	});
});

test('first small, then big', t => {
	t.plan(1);

	const db1 = new SetDB(network);
	db1.on('ready', () => {
		const db2 = new SetDB(network, {
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

	const db1 = new SetDB(network);
	const db2 = new SetDB(network);

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
