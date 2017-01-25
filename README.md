# live-mongodb-fixtures - Easy MongoDB test fixtures for Node.js

This package provides an API to make it easy to use live data for MongoDB test
fixtures for better reliability and indirect fuzz testing over hand tailored
fixtures.

When running `npm run fixtures get` this package will produce BSON files
containing your fixture data which can be checked into a repository for
versioned test fixtures.

## Installation

This package is available on NPM.

Install with:

```bash
yarn add --dev live-mongodb-fixtures
```

If you're not using [`yarn`](https://yarnpkg.com/) yet, you should consider it,
because it's awesome.

You can still install via NPM as well if you want.

```bash
npm install --save-dev live-mongodb-fixtures
```

## Usage

This package provides two parts for your convenience. The first is a
programmatic API for defining your fixtures and using them with tests. The
second is a hook to allow you to easily create an npm run-script for
manipulating your fixtures.

### Defining your fixtures

The API exports a single class, `Fixture`, which you use to create your
definitions. You should create a `test/fixtures.js` file in your project.

You'll need to import your MongoDB models as well. Almost all the popular
frameworks will work, so long as they define `find`, `save` and `remove`
methods on the collection, which should take callbacks and use the MongoDB
query syntax.

Here is an example file:

```javascript
// test/fixtures.js

"use strict"

// Imports
const Fixture = require('live-mongodb-fixtures')
const models = require('../models')

// Define a fixture for users
exports.users = new Fixture({
    // This is the fixture name, it must be unique for your project
    name: 'users',
    // This is a required option, which is a hash defining the collections
    collections: {
        // This is the key to use for querying to find fixtures
        user_name: [
            // These are the collections that use the user_name key to query
            models.User,
            models.Settings,
            models.Posts
            ],
        // You can use additional key and collection definitions here
        // ...
    },
    // This is a required list of key values to query for using the keys above
    keys: [
        'alan_shepard',
        'neil_a',
        'buzz_a',
    ]
})

// You can continue defining more exports for specific fixtures for individual
// test suites
// ...

// This is required boilerplate that parses all the fixtures, validates them,
// and handles the CLI run-script hooks
Fixture.init(module)

```

#### BSON files

Using *live-mongodb-fixtures* will create a lot of `.bson` files. By default,
they will be written into the same directory as the module that defines the
fixtures. In our example, that would be `./test/` because the module is
`./test/fixtures.js`.

If your fixtures lived at `./test/fixtures/users.js` instead, then the BSON
files would be written to `./test/fixtures/`.

You should commit the BSON files to your repository to be reused with tests,
and occassionally updated as needed.

#### The collections and keys

In the above example, the collections hash defines three models that use the
`user_name` key to query. In addition, it defines three values to look for when
querying. 

When loading the fixtures for the above example, *live-mongodb-fixtures* will
perform the equivalent of the following three queries:

```javascript
models.User.find({
        user_name: {
            $in: ['alan_shepard', 'neil_a', 'buzz_a']
        }
    }, callback)
models.Settings.find({user_name: {$in: ['alan_shepard', 'neil_a', 'buzz_a']}}, callback)
models.Posts.find({user_name: {$in: ['alan_shepard', 'neil_a', 'buzz_a']}}, callback)
```

In general, the format for a Fixture will be like:

```javascript
exports.users = new Fixture({
    name: '<unique name>',
    collections: {
        <query key>: [<collection instance>, ...],
    },
    keys: [<query values>, ...]
})
```

And the resulting query to find the Fixture data will be like:

```javascript
<collection instance>.find({<query key>: {$in: [<query value>]}}, ...)
```

### Using fixtures in test suites

This package provides a couple useful methods for use with test suites in order
to load or remove fixtures.

Here's an example:

```javascript
// test/example.js
"use strict"

// Import your fixtures (such as the text/fixtures.js example above)
const fixtures = require('./fixtures')

// This is an imaginary test suite.
//
// You can set up individual fixtures for each test suite, or for an entire
// test module, or your entire project. It's entirely up to you how you organize
// it.
define("a test suite", function () {
    before(function (done) {
        // This will load your fixtures into the test database
        fixtures.users.load(done)
    })

    after(function (done) {
        // This is optional, but can be helpful if other suites use the same
        // fixtures or the same query keys.
        fixtures.users.clear(done)
    })

    // Tests to use these fixtures go here.
    // ...
})
```

### Adding NPM run-scripts for fixtures

This package provides hooks for run-scripts as long as you remember to use the
`Fixture.init(module)` boiler plate.

Add the following to your `package.json`, assuming your fixtures are in
`./test/fixtures.js` in your project.

```javascript
{
    // package.json definitions
    // ...
    "scripts": {
        "fixtures": "DEBUG=fixtures* node ./test/fixtures.js"
    }
}
```

- The `DEBUG=fixtures*` portion is optional, but if you don't include it, the
  scripts will not produce output and you'll have to check the return code of
  the program (non-zero indicates failure.)

#### Script commands

- `npm run fixtures get` - Queries for the defined fixtures from the database
  and writes them out to BSON files in the fixture definition's directory. If
  you're happy with the fixtures, you should check them into version control.
- `npm run fixtures load` - Reads existing BSON files and loads them into the
  test database. This is useful if you want to manipulate the records to create
  specific test conditions.

### An example workflow

This section describes an example of setting up fixtures for some tests.  Your
file names, environments, and so forth may vary. Hopefully this will give you
an idea of how to get the most of out of *live-mongodb-fixtures*.

1. Figure out that you have some tests that need fixtures.
2. Install *live-mongodb-fixtures* into your development dependencies.
3. Create a `./test/fixtures.js` with a definition of the fixtures you need for
   your tests.
4. Add a `"fixtures"` run-script that runs the *live-mongodb-fixtures* hook.
5. Using `NODE_ENV=production` or whatever equivalent your project uses, run
   `npm run fixtures get` to query for real data, and save it to BSON in your
   `./test/` directory.
6. Using `NODE_ENV=test` or your equivalent, run `npm run fixtures load` to
   load those BSON files into your test or local database.
7. Use the `mongo` client, or whatever you choose, to view, edit, and
   manipulate the fixtures in your test or local database to set up the test
   data conditions you need.
8. Using `NODE_ENV=test` (or equiv.), run `npm run fixtures get` to query your
   test or local database for the data you manipulated, and write it out to
   BSON files.
9. Commit the BSON files to source control, so they are available for all tests
   in the future.
10. Use the provided *load()* and *clear()* methods in your test suite's
    *before()* and *after()* hooks to load your new fixtures and remove them
    when done, so you have real, repeatable data fixtures for your test suite.

## API documentation

This section documents the public API methods.

### `Fixture(`*`options`*`)`

Define a new fixture.

- **name** (*String*) - A unique name, per project, for the fixture
- **collections** (*Object*) - A hash mapping query keys to collections
- **keys** (*Array*) - An array of values to query for using the query keys
  defined in the *collections* hash
- **path** (*String*) - (optional) Path to use for BSON files for this Fixture.
  Defaults to the same directory as the fixture module file.

### `.load(`*`callback`*`)`

Load BSON fixtures into a test database.

### `.get(`*`callback`*`)`

Query for data from a live database and write it to BSON.

### `.clear(`*`callback`*`)`

Remove fixture data from a test database.

