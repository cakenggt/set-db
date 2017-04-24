require("leaked-handles");
const SetDB = require('./index');
const test = require('tape');

const network = 'test';

test('sync dbs', t => {
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

/*
var db = new SetDB('test', {
  dbHash: 'QmZ6BstVjmMqryBZ25adBSwiT2jwPKu1ek4xZKHU4TL8zG'
});

db.put({
  _id: '3',
  name: 'test'
});
*/
