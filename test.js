require("leaked-handles");
const SetDB = require('./index');
const test = require('tape');

const network = 'test';

test('put dbs', t => {
  var db1 = new SetDB(network);
  var db2 = new SetDB(network);

  t.plan(2);
  t.deepEqual(db1.db, db2.db);
  db1.put({
    _id: '1',
    name: 'testname'
  });
  db2.on('sync', () => {
    t.deepEqual(db1.db, db2.db);
    db1.stop();
    db2.stop();
  });
});

test('load db', t => {
  var db = new SetDB(network, {
    dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
  });
  t.plan(1);
  db.on('ready', () => {
    t.deepEqual(db.db, {
      '1': {
        _id: '1',
        name: 'testname'
      }
    });
    db.stop();
  });
});

test('sync dbs', t => {
  var db1 = new SetDB(network, {
    dbHash: 'QmPVfQJ4yjgwz2XQESBjRmJmYZYjJdYW2bd61jUMAqis6V'
  });
  var db2 = new SetDB(network);

  t.plan(1);
  db2.on('sync', () => {
    t.deepEqual(db1.db, db2.db);
    db1.stop();
    db2.stop();
  });
});

/*
var db = new SetDB('test', {
  dbHash: 'QmZ6BstVjmMqryBZ25adBSwiT2jwPKu1ek4xZKHU4TL8zG'
});

db.put({
  _id: '3',
  name: 'test'
});
*/
