const fs        = require("fs");
const path      = require("path");
const express   = require("express");
const app       = express();

// Local application config
const g_Config = JSON.parse( fs.readFileSync( "./config.json","utf8" ) );

// Settings 
var g_Settings = {

    port: process.env.port || g_Config.port || 3000,
    updateRate: process.env.updateRate || g_Config.updateRate || 1000,
    expireTime: process.env.expireTime || g_Config.expireTime || 120
}

// Contains all server listings
var g_Servers = {};

// Stats
var g_Players = 0;
var g_TotalSlots = 0;
var g_Capacity = 0;

// The keys we expect listing json to have 
var JSON_RequiredKeys = ["name","port","players","maxPlayers",]

// Middlewares
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, './www')));
app.use(express.json());


/**
 * Displays collected server stats in the console, refresh whenever you like
 */

function ShowStats(){

    console.clear();
    
    // Edgy banner
    console.log( "    __________________________________________________________" );
    console.log(`
     _____   _____  _     _      _____  _      _     _  _____
    |_____] |_____|  \\___/  ___ |_____] |      |     | |_____
    |       |     | _/   \\_     |       |_____ |_____|  _____|
    `);
    console.log( "    __________________________________________ masterserver __\r\n\r\n" );
    console.log( "    Reporting %s servers, %d total slots. \r\n\r\n", Object.keys( g_Servers ).length, g_TotalSlots);
    console.log( "    PLAYERS: %s  [ %d % capacity ] \r\n\r\n", g_Players, g_Capacity );
    console.log( "\r\n" );
    console.log( "    . . . . . . . . . . . . . . . . . . . . . . Port: %s . .", g_Settings.port );
}

/**
 * Expires old server listings & collects global stats. 
 * The less this is called, the longer outdated listings & stats stay up
 */

function Tick(){

    let totalSlots = 0;
    let players = 0;

    for ( let server in g_Servers ) {

        // Discard servers that haven't resent within a reasonable time
        let age = (new Date() - g_Servers[server].added) / 1000;

        if ( age > g_Settings.expireTime ) {

            delete g_Servers[server];
            continue;
        }

        totalSlots += parseInt( g_Servers[server].maxPlayers );
        players += parseInt( g_Servers[server].players );
    }

    g_Players = players;
    g_TotalSlots = totalSlots;
    g_Capacity = g_Players > 0 ? ( g_Players / g_TotalSlots ) * 100 : 0;
}

/**
 * Give anyone who asks the current listings :)
 */

app.get( '/serverListings', function( req, res ) {

    res.send( JSON.stringify(g_Servers) );
})

/**
 * Provide configuration settings to clients
*/

app.get( '/config', function( req, res ) {

    res.send( JSON.stringify( {

        ServiceMessage: "TEST ANNOUNCEMENT",
        HeartbeatInterval: 300000,
    
    }));
})

/**
 * Server a listing page as well
 */
app.get( '/', function( req, res ){

    res.render('pages/serverlist', {
        meta: {
            players: g_Players,
            capacity: g_Capacity
        },

        servers: g_Servers
    });
});

/**
 * Update server listings according to the reporting client data.
 * Clients only post specific listings that need to be added, updated or removed to minimize traffic.
 * They will bulk repost listings, should their connection to the masterserver be interrupted.
 */

app.put( '/serverListings', function( req, res ) {

    let messages = req.body;

    if ( !messages ) return;

    // Go through all listings
    for ( let i = 0; i < messages.length; i++ ) {

        let message = messages[i];

        // We are missing crucial stuff, bail out.
        if ( !message.type || !message.server ) {

            res.status(400);
            return res.send('Malformed request.');
        }

        // Very simple validation to see if we atleast have all of the keys.
        for ( let keyIndex=0; keyIndex > JSON_RequiredKeys.length; keyIndex++ ) {

            let key = JSON_RequiredKeys[keyIndex];

            if ( !message.server[key] || message.server[key] == undefined ) {

                res.status(400);
                return res.send('Missing JSON data: '+ key );                
            }
        }

        // Sanitize
        for ( let key in message.server ) {
            message.server[key] = message.server[key].toString().replace(/[^-:a-zA-Z 0-9\n\r]+/g, '');
        }

        // Listings on the reporting client are mapped by their port only, but on the masterserver listings are mapped by IP:Port
        let serverKey = req.ip+":"+message.server.port;

        // Don't need timeout or port information here anymore
        delete message.server.timeout;
        delete message.server.port;

        // Decide what needs to be done
        switch( message.type ) {

            default: // If not an add / update / delete operation
                res.status(400);
                res.send('Unknown operation type.');
                break;

            case "add": // Add and update both overwrite existing entries, no harm done
            case "update":
                message.server.added = new Date();
                g_Servers[ serverKey ] = {};
                g_Servers[ serverKey ] = message.server;
                res.status(200);
                res.send('Server added / Updated.');
                break;

            case "delete": // Remove listing
                delete g_Servers[ serverKey ];
                res.status(200);
                res.send('Server removed.');
                break;
        }
        
    }

})

// Force IPv4 for nicer mapping
app.listen( g_Settings.port, "0.0.0.0", () => {
    
    // Update on the regular
    setInterval( () => {

        Tick();
        ShowStats();
    }, g_Settings.updateRate )

})

