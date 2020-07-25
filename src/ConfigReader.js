const fs = require('fs');
let ConfigReader = function(county){
	this.county = county;
	const DEV_CONFIG_FILENAME = 'config/'+this.county.toLowerCase()+'_dev_config.json';
	const USER_CONFIG_FILENAME = 'config/'+this.county.toLowerCase()+'_user_config.json';
	
	
	let devConfigJSON = fs.readFileSync(DEV_CONFIG_FILENAME);
	let userConfigJSON = fs.readFileSync(USER_CONFIG_FILENAME);
	this.DEV_CONFIG = JSON.parse(devConfigJSON);
	this.USER_CONFIG = JSON.parse(userConfigJSON);

}

module.exports = ConfigReader;