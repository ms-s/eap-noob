var sqlite3 = require('sqlite3').verbose();
var serverDBPath = '/var/serverDB';

serverDB = new sqlite3.Database(serverDBPath);
serverDB.all(
	'select DeviceID, DeviceName, Description from Device',
	function(err, deviceRows) {
		if (!err) {
			deviceRows.forEach(function(row) {
				var deviceID = parseInt(row.DeviceID);
				var deviceName = row.DeviceName;
				var description = row.Description;
				if (description != '') {
					serverDB.run(
						'insert into Notification (DeviceID, NotificationType, Description)\
						values(?, ?, ?)',
						deviceID, 'SoftwareUpdate', 'Software Update for ' + deviceName,
						function(err) {
							if (err) {
								console.log('Error when inserting to Notification: ' + err);
							}
						}
					);
				}
			});
		} else {
			console.log('Error in select: ' + err);
		}
	}
);
serverDB.close();
