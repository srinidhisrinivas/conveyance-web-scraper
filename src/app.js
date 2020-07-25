/**
 * Required External Modules
 */

const express = require("express");
const path = require("path");
const scrape = require("./index.js");
const ConfigReader = require("./ConfigReader.js");
const ErrorLogger = require("./ErrorLogger.js");
const open = require("open");

const args = process.argv.slice(2);
const county = args[0];
const CONFIG = new ConfigReader(county);
const ERROR_LOGGER = new ErrorLogger(county);

/**
 * App Variables
 */

const app = express();
const port = process.env.PORT || CONFIG.DEV_CONFIG.APP_PORT;



// app.use(bodyParser.urlencoded({extended:true}));
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).sendFile(path.join(__dirname + "/counties/"+county+"/index.html"));
});

open("http://localhost:"+port);

app.get("/complete", (req, res) => {
  res.status(200).send('Complete');
});

app.post("/submit", (req, res) =>{
	// res.send(req);
	const TIMEOUT_VAL = CONFIG.DEV_CONFIG.POST_RESPONSE_TIMEOUT_MSEC;
	res.setTimeout(TIMEOUT_VAL);
	// console.log(req.params);
	let data = req.body;


	console.log('Post received')
	console.log((new Date()).toString());
	let id = setTimeout(function(){
		res.send({text: 'I\'m tired of waiting for the program to finish!',
					  description: 'But it is still running. Please wait for file to be appended with \'_complete\' before opening.'
			});
	}, (TIMEOUT_VAL-500));
	scrape(data.start, data.end, county).then((status) => {
		console.log('Complete at server, sending response');
		console.log((new Date()).toString());
		try{

			if(status.code === CONFIG.DEV_CONFIG.SUCCESS_CODE){
				res.send({text: 'Complete!',
						  description: 'Excel file is: ' + status.finalpath
				});
			} else {
				res.send({text: 'Failed!',
						  description: 'See error log for more information'
				});
			}
		} catch (e){
			console.log(e);
			ERROR_LOGGER.log(e);
			return;
		}
	}).catch(function error(e){
		console.log(e.message);
		ERROR_LOGGER.log(e);
		res.send({text: 'Error!',
				description: 'Please check error log for latest error'});
	});
	
});

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});