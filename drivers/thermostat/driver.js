"use strict";

var path			= require('path');

var request			= require('request');
var extend			= require('extend');

var api_url			= 'https://portal.icy.nl';

var self = module.exports = {

	init: function( devices, callback ){

		// we're ready
		callback();
	},

	capabilities: {
		target_temperature: {
			get: function( device, callback ){
				getThermostatInfo( device, function( err, info ){
					callback( err, info.temperature1 );
				});
			},
			set: function( device, target_temperature, callback ){
				if( target_temperature < 5 ) target_temperature = 5;
				if( target_temperature > 30 ) target_temperature = 30;

				target_temperature = roundHalf( target_temperature );

				setThermostatTemperature( device, target_temperature, callback);
				self.realtime(device, 'target_temperature', target_temperature);
			}
		},
		measure_temperature: {
			get: function( device, callback ){
				getThermostatInfo( device, function( err, info ){
					callback( err, info.temperature2 );
				});
			}
		}
	},

	pair: function( socket ) {

		// Send log
		Homey.log('ICY E-Thermostaat pairing has started...');

		// Define variables
		var tempSerialthermostat = '';
		var tempUsername = '';
		var tempPassword = '';

		socket.on('get_devices', function( data, callback ) {

			// Set passed credentials in variables
			tempUsername = data.username;
			tempPassword = data.password;

			// Test credentials, get token.
			request.post( api_url + '/login', {

				// Build post data
				form: {
					'username'		: tempUsername,
					'password'		: tempPassword
				},

				// Send data as json
				json: true

			// On return
			}, function( err, response, body ){

				// If an error has occurred
				if ( err ) return socket.emit ( 'error', 'error' );

				// Checking credentials
				Homey.log('ICY E-Thermostaat username/password are being checked');

				// If status is 401 - Not authorized
				if (body.status.code == 401) {

					// Send log
					Homey.log('ICY E-Thermostaat username/password are wrong');

					// Return error
					socket.emit ( 'error', 'notauthorized' );
					return;

				}

				// If status is 200 - Ok
				if (body.status.code == 200) {

					// Send log
					Homey.log('ICY E-Thermostaat username/password are correct');

					// Set thermostat serial
					tempSerialthermostat = body.serialthermostat1;

					// Credentials work, continue
					socket.emit ( 'continue', null );
					return;

				// Anything else should give error
				} else {

					Homey.log('ICY E-Thermostaat username/password could not be checked');

					// Return error
					socket.emit ( 'error', 'notauthorized' );
					return;

				}

			});

		});

		socket.on('list_devices', function( data, callback ) {

			var devices = [{
				data: {
					id				: tempSerialthermostat,
					username	: tempUsername,
					password	: tempPassword
				},
				name: 'E-Thermostaat'
			}];

			callback( null, devices );

		});

		socket.on('disconnect', function( data, callback ){
			console.log('disconnect!!!', arguments)
		});

	}

}

var thermostatInfoCache = {
	updated_at: new Date("January 1, 1970"),
	data: {}
};

function getThermostatInfo( device, force, callback ) {

	if( typeof force == 'function' ) callback = force;

	// Send log
	Homey.log('ICY E-Thermostaat checking data');

	// Check if cache is within time range
	if( !force && ((new Date) - thermostatInfoCache.updated_at) < 1000 * 60 * 2 ) {

		// Cache is younger then 2 minutes, serve cache instead of live data.
		callback(thermostatInfoCache.data);

	} else {

		// Cache is older then 2 minutes, get fresh data

		// Get token
		getToken(device, function(token){
			if(token !== false) {
				request.get( api_url + '/data', {
					form: {
						'username'		: device.username,
						'password'		: device.password
					},
					headers: {
			      'Session-token': token
			    },
					json: true
				}, function( err, response, body ){

					if( err ) return callback(err);

					// Update cache data
					thermostatInfoCache.updated_at = new Date();
					thermostatInfoCache.data = body;

					// Set the new temperature
					self.realtime(device, 'measure_temperature', thermostatInfoCache.data.temperature2);
					self.realtime(device, 'target_temperature', thermostatInfoCache.data.temperature1);

					// Return new data
					callback( null, thermostatInfoCache.data );

				});
			}
		});

	}

}

function setThermostatTemperature( device, temperature, callback ) {

	// Send log
	Homey.log('ICY E-Thermostaat sending new temperature');

	// Get token
	getToken(device, function(token){
		if(token !== false) {
			request.post( api_url + '/data', {
				form: {
					'uid'					: device.id,
					'temperature1'		: temperature
				},
				headers: {
		      'Session-token': token
		    },
				json: true
			}, function( err, response, body ){

				if( err ) return callback(err);

				// update thermosmart info
				getThermostatInfo( device, true, callback );

			});
		}
	});

}


function getToken(device, callback){

	Homey.log('ICY E-Thermostaat retreiving new token');

	// Test credentials, get token.
	request.post( api_url + '/login', {
		form: {
			'username'		: device.username,
			'password'		: device.password
		},
		json: true
	}, function( err, response, body ){

		if( err ) return callback(err);

		if(body.status !== undefined && body.status !== null && body.status.code !== undefined && body.status.code !== null) {
			// If status is 200 - Ok
			if (body.status.code == 200) {
				module.exports.setAvailable(device);
				// Send log
				Homey.log('ICY E-Thermostaat username/password are correct, returning token.');

				// Return token
				callback(body.token);

			}
		} else {
			module.exports.setUnavailable(device, "ICY E-Thermostaat Webservice Offline." );
			callback(false);
		}

	});

}

function roundHalf(num) {
    return Math.round(num*2)/2;
}
