/**
 * Required External Modules
 */

const express = require("express");
const path = require("path");
const scrape = require("./index.js")


/**
 * App Variables
 */

const app = express();
const port = process.env.PORT || "8000";

// app.use(bodyParser.urlencoded({extended:true}));
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).sendFile(path.join(__dirname + "/index.html"));
});

app.get("/complete", (req, res) => {
  res.status(200).send('Complete');
});

app.post("/submit", (req, res) =>{
	// res.send(req);
	const TIMEOUT_VAL = 20000;
	res.setTimeout(TIMEOUT_VAL);
	// console.log(req.params);
	let data = req.body;


	console.log('Post received')
	console.log((new Date()).toString());
	let id = setTimeout(function(){
		res.send({text: 'Timed out!',
					  description: 'Took too long for thing to respond.'
			});
	}, (TIMEOUT_VAL-500));
	scrape(data.start, data.end).then((status) => {
		console.log('Complete at server, sending response');
		console.log((new Date()).toString());
		if(status.code === 0){
			res.send({text: 'Complete!',
					  description: 'Excel file is: ' + status.finalpath
			});
		} else {
			res.send({text: 'Failed!',
					  description: 'See error log for more information'
			});
		}
	});
	
});

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});