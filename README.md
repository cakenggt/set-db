# Set-DB

Set-DB is a synchronized distributed docstore database backed by IPFS using pubsub. It only supports adding new entries, rejecting any existing entry modification or deletion.

## API

### `SetDB(options)`

The constructor for SetDB takes in an options object detailed below.
* `validator` Function which new entries to the db are passed through. Should return `true` if the entry is valid, or `false` if it isn't. Default is a function which always returns `true`.
* `dbHash` IPFS multihash of a database to hydrate the SetDB instance with. Default is none.
* `indexBy` Which key in the records to index the SetDB by. Default is `_id`.

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
