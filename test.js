require('leaked-handles'); // eslint-disable-line import/no-unassigned-import
const test = require('tape');
const SetDB = require('./index');

const network = 'test';

test('put dbs', t => {
	const db1 = new SetDB(network);
	const db2 = new SetDB(network);

	t.plan(2);
	t.deepEqual(db1.db, db2.db);
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

test('load db', t => {
	const db = new SetDB(network, {
		dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
	});
	t.plan(1);
	db.on('ready', () => {
		t.deepEqual(db.db, {
			1: {
				_id: '1',
				name: 'testname'
			}
		});
		db.disconnect();
	});
});

test('sync dbs', t => {
	const db1 = new SetDB(network, {
		dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
	});
	const db2 = new SetDB(network);

	t.plan(1);
	db2.on('sync', () => {
		t.deepEqual(db1.db, db2.db);
		db1.disconnect();
		db2.disconnect();
	});
});

test('no mutate', t => {
	const db1 = new SetDB(network);

	t.plan(1);
	const orig = {
		1: {_id: '1', name: 'a'}
	};
	db1.put(orig['1']);
	orig['1'].name = 'new';
	t.notDeepEqual(db1.db, orig);
	db1.disconnect();
});

test('hash change after put', t => {
	const db = new SetDB(network);

	t.plan(1);
	const hash1 = db.dbHash;
	db.put({_id: '1', name: 'test'});
	db.on('sync', () => {
		t.notEqual(hash1, db.dbHash);
		db.disconnect();
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
