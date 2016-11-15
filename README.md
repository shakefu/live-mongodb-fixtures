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
npm install --save-dev live-mongodb-fixtures
```

## Usage

This package provides two parts for your convenience. The first is a
programmatic API for defining your fixtures and how to query for them. The
second is a hook to allow you to easily create an npm run-script for
manipulating your fixtures.

### Defining your fixtures

The API exports a single class, `Fixture`, which you use to create yoru
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
    // This is the list of key values to query for in the defined key above
    keys: [
        'shakefu',
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

### Using fixtures in test suites

This package provides a couple useful methods for use with test suites in order
to load or remove fixtures.

Here's an example:

```javascript
// test/example.js
"use strict"

// Import your fixtures
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
        fixtures or the same query keys.
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


