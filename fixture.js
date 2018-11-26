"use strict"
/**
 * Test fixtures.
 */
// System
const fs = require('fs')
const path = require('path')
const assert = require('assert')

// 3rd party
const _ = require('lodash')
const EJSON = require('mongodb-extjson')
const async = require('async')
const debug = require('debug')('fixtures')


/**
 * Fixture class itself.
 *
 * See the README for usage documentation.
 */
class Fixture {
    constructor (options) {
        // This is the fixture's name, it's just an identifier
        assert(_.isString(options.name), "Fixture name must be String")
        this.name = options.name

        // Create our debug logger
        this.debug = require('debug')(`fixtures:${this.name}`)

        // We parse the collection options to prep it for use
        assert(_.isObject(options.collections),
            "Fixture collections must be Object")
        this.fixtures = this.parse(options.collections)

        // Get our list of keys for this
        assert(_.isArray(options.keys), "Fixture keys must be Array")
        this.keys = options.keys

        // Default path is unset
        this.path = options.path || null
    }

    static init (module) {
        let fixtures = Fixture.getFixtures(module)

        // Get the path to the fixture file, which will be the default path
        if (module.filename) {
            let dir = path.dirname(module.filename)

            // Update all the fixtures that don't specify a path with the one
            // given

            _.each(fixtures, (fixture) => {
                if (fixture.path) return
                // Assign the directory we found if we don't have a path already
                fixture.path = dir
            })
        }

        // Debug output of the directory used for each Fixture
        _.each(fixtures, (fixture) => {
            debug(`${fixture.name}: directory: ${fixture.path}`)
        })

        if (module.parent) {
            debug("Fixtures ready.")
            return
        }

        debug("Starting fixture CLI")
        // TODO: Pass in exports?
        Fixture.main(module)
    }

    static getFixtures (module) {
        let exports = module.exports

        // Get all the exported fixtures in this module
        let names = {}
        let fixtures = []
        _.each(exports, (fixture) => {
            if (!(fixture instanceof Fixture)) return
            if (names[fixture.name]) {
                throw new Error(`Duplicate fixture name: ${fixture.name}`)
            }
            fixtures.push(fixture)
            names[fixture.name] = true
        })

        return fixtures
    }

    parse (fixtures) {
        let found = []
        this.debug(`Parsing ${this.name}`)

        // Update all the fixture values to be array, to handle single-item
        // syntax seamlessly
        fixtures = _.mapValues(fixtures, (value) => {
            if (!_.isArray(value)) return [value]
            return value
        })

        // this.debug(fixtures)

        _.each(fixtures, (collections, key) => {
            _.each(collections, (collection, i) => {
                // This name will always be unique
                let name = this.parseName(collection,
                    `${this.name}.${key}[${i}]`)

                // Validate that our collecitons have a compatible API,
                // including find, remove, and save
                assert(_.isFunction(collection.find),
                    `Fixture collection ${name} missing find method`)
                assert(_.isFunction(collection.remove),
                    `Fixture collection ${name} missing remove method`)
                assert(_.isFunction(collection.save),
                    `Fixture collection ${name} missing save method`)

                found.push({
                    name: name,
                    collection: collection,
                    key: key
                })

                this.debug(`Fixture collection ${name}: OK`)
            })
        })

        this.debug(`Found ${found.length} fixture collections`)

        return found
    }

    /**
     * Return a name based on the available properties on the collection.
     */
    parseName (collection, name) {
        // Try to get a better name, but it may not be unique
        // TODO: Figure out if this breaks in other non-HumbleJS ODMs
        if (collection.name) {
            name = `${this.name}.${collection.name}`
        }
        // Try again to get a better name, checking for uniqueness
        if (collection._name) {
            name = `${this.name}.${collection._name}`
        }
        // Try one last time to get a better name
        if (collection.collection &&
            collection.collection._name) {
            name = `${this.name}.${collection.collection._name}`
        }

        return name
    }

    /**
     * Load fixtures from EJSON into the database.
     */
    load (callback) {
        // Build all the loaders for the collections
        let loaders = _.map(this.fixtures, (fixture) =>
            this.loadDocs.bind(this, fixture))

        async.parallel(loaders, (err, results) => {
            if (err) return callback(err)
            // this.debug(results)
            callback(null, results.reduce((a, b) => a + b))
        })
    }

    /**
     * Query for fixtures in a database and write them to EJSON.
     */
    get (callback) {
        // Build our queries
        let queries = _.map(this.fixtures, (fixture) =>
            this.findDocs.bind(this, fixture))

        async.parallel(queries, (err, results) => {
            if (err) return callback(err)
            // this.debug(results)
            callback(null, results.reduce((a, b) => a + b))
        })
    }

    /**
     * Remove fixture documents.
     */
    clear (callback) {
        this.debug(`Removing documents.`)

        let queries = _.map(this.fixtures, (fixture) =>
            this.clearDocs.bind(this, fixture))

        async.parallel(queries, (err, results) => {
            if (err) return callback(err)
            results = _.map(results, 'n')
            results = results.reduce((a, b) => a + b)
            debug(`Removed ${results} documents`)
            callback(null, results)
        })
    }

    /**
     * Query for documents for a fixture.
     */
    findDocs (fixture, callback) {
        this.debug(`Getting ${fixture.name}, looking for ${this.keys.length} ` +
            `documents.`)
        // Try to find our documents for the fixture
        fixture.collection.find(
            // Build the query hash
            this.query(fixture.key, this.keys),
            (err, docs) => {
                if (err) return callback(err)
                // debug(`Got ${docs.length} for ${fixture.name}`)
                // Write out the docs to EJSON
                this.writeDocs(this.filename(fixture.name), docs, callback)
        })
    }

    /**
     * Read documents from the filesystem and store them to the database.
     */
    loadDocs (fixture, callback) {

        fs.readFile(this.filename(fixture.name), (err, docs) => {
            if (err) return callback(err)

            // Convert the fixtures back into javascript
            docs = EJSON.parse(docs)
            docs = _.toArray(docs)

            this.debug(`Loaded ${docs.length} from ${fixture.name}`)

            // Create partial functions for saving the docs back. For whatever
            // reason .save() didn't work with multiple docs, so we use
            // async.parallel instead
            docs = _.map(docs, (doc) =>
                fixture.collection.save.bind(fixture.collection, doc))

            // Save everything to the DB, overwriting anything already there
            async.parallel(docs, (err, results) => {
                if (err) return callback(err)
                callback(null, results.filter((i) => i != null).length)
            })
        })
    }

    /**
     * Serialize fixture documents to EJSON and write to the filesystem
     *
     * @param file {String} - Filename to write to
     * @param docs {Array} - Array of documents to write out
     * @param callback
     */
    writeDocs (file, docs, callback) {
        debug(`Writing ${docs.length} documents to ${file}`)
        // Serialize the documents straight to EJSON
        let data = EJSON.stringify(docs)
        // And dump to the filesystem for later use
        fs.writeFile(file, data, (err) => {
            callback(err, docs.length)
        })
    }

    /**
     * Removes the fixture documents from the database.
     */
    clearDocs (fixture, callback) {
        // Removedocs
        fixture.collection.remove(this.query(fixture.key, this.keys), callback)
    }

    /**
     * Return a filename for the fixture
     *
     * @param name {String} - Collection name
     */
    filename (name) {
        // Provide a default directory to write to
        let dir = this.path || './test'
        return `${dir}/${name}.ejson`
    }

    /**
     * Return a query hash for MongoDB.
     *
     * This uses the $in operator by default, but maybe should be overridden at
     * some point.
     */
    query (key, values) {
        return {[key]: {$in: values}}
    }

    /**
     * Runs the Fixture CLI
     */
    static main (module) {
        let fixtures = Fixture.getFixtures(module)

        // Decide whether we're loading, getting, or erroring
        let cmd = process.argv[2]
        cmd = {
            'load': Fixture.loadAll,
            'get': Fixture.getAll,
        }[cmd]

        // Didn't match? We're done here
        if (!cmd) {
            debug("Invalid or missing command")
            process.exit(1)
        }

        // Run the command
        cmd(fixtures)
    }

    /**
     * Loads all fixtures.
     */
    static loadAll (fixtures) {
        async.parallel(
            _.map(fixtures, (fixture) => fixture.load.bind(fixture)),
            (err, results) => {
                if (err) {
                    debug(err)
                    throw err
                }
                debug(results)
                results = results.reduce((a, b) => a + b)
                debug(`Wrote ${results} documents to database.`)
                process.exit(0)
            })
    }

    /**
     * Gets all fixtures from the active DB and writes them to EJSON files.
     */
    static getAll (fixtures) {
        // Get all fixtures in parallel
        async.parallel(
            _.map(fixtures, (fixture) => fixture.get.bind(fixture)),
            (err, results) => {
                if (err) {
                    debug(err)
                    throw err
                }
                debug(results)
                results = results.reduce((a, b) => a + b)
                debug(`Wrote ${results} documents to fixture files.`)
                process.exit(0)
            })
    }
}

module.exports = Fixture
