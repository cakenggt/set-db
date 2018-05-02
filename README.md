# Set-DB

Set-DB is a synchronized distributed docstore database backed by IPFS using pubsub. It only supports adding new entries, rejecting any existing entry modification or deletion.

## API

### `SetDB(options)`

The constructor for SetDB takes in an options object detailed below.
* `validator` Function which new entries to the db are passed through. Should return `true` if the entry is valid, or `false` if it isn't. Default is a function which always returns `true`.
* `dbHash` IPFS multihash of a database to hydrate the SetDB instance with. Default is none.
* `indexBy` Which key in the records to index the SetDB by. Default is `_id`.
* `ipfs` An IPFS node object gotten from `js-ipfs`.
* `repo` Optional repo string.

### `connect`

Manually connect to IPFS pubsub for updates. This is automatically called in the SetDB constructor.

### `disconnect`

Manually disconnect from IPFS pubsub.

### `query(func)`

Query the SetDB for records. The function passed in should be a filter function.

### `get(id)`

Get a specific record by id.

### `put(record)`

Put a record in the DB. The validator function passed in the options object of the constructor is run on the record. The record must not exist in the SetDB under it's ID and must pass the validator function to be added. Remote databases will be sync'd after this.

## Events

### `ready`

Fired either when the SetDB successfully hydrates itself from it's `dbHash` entry from IPFS, or when there is no `dbHash` entry in the options object.

### `sync`

Fired when new data is incorporated into the SetDB from some other SetDB instance, or put in by this instance.

### `error`

Fired when there is an error. The error is passed in the single argument.

## Theory of Operation

SetDB relies on IPFS pubsub, which is currently implemented as floodsub (which means every client subscribed to that topic gets the message at once). Thus, you cannot guarantee that a SetDB instance will not receive it's own message. SetDB was designed with this in mind to prevent infinite loops of requests.

When the SetDB is initialized, it first sees if it was provided a `dbHash`. If it was, it retrieves the file in IPFS corresponding to that hash, adds all of the entries which both have a value in the `indexBy` attribute, and all entries that pass the optional `validator` function, and then emits the `ready` event. If the SetDB does not have a `dbHash`, then it just calls the `ready` event.

Then, if the SetDB has a `dbHash`, it will emit a `NEW` request with that hash in it to tell everyone in the network that this version of the database exists. This is to update any clients which may already be running but have a less complete database. Afterwards, it will emit an `ASK` request, asking all connected SetDB's for their current database hashes. This is so that it can receive the most complete database possible.

When a SetDB instance, through either a `put` method call or the reception of a `NEW` request, adds content to it's database, it saves this database in IPFS. It then emits a `NEW` request with that database's hash in it. On the reception of a `NEW` request, a client fetches that version of the database from IPFS and goes through each entry to see if it has the requisite `indexBy` attribute, passes the optional `validator` function, and doesn't exist already in the database. If all three of these things are true, then it will be added to the database. Once all of the items have been gone through, if any new items have been added to the database, the database will be saved and a `NEW` request will be emitted with this new database's hash in it. However, if none have been added, no request is sent out, thus preventing an infinite request loop.
