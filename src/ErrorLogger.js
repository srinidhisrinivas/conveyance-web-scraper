const ConfigReader = require('./ConfigReader.js');
const fs = require('fs');

function ErrorLogger(county){
	const CONFIG = new ConfigReader(county);
	const errorFile = CONFIG.DEV_CONFIG.ERROR_LOG_FILE;
	this.log = function(message){
		let date = new Date();
		message = date.toString() + '\n\n' + message + '\n';

		var data = fs.readFileSync(errorFile).toString().split("\n");
		data.splice(0, 0, message);
		var text = data.join("\n");

		fs.writeFile(errorFile, text, function (err) {
		  if (err) return err;
		});
	}
}

module.exports = ErrorLogger;