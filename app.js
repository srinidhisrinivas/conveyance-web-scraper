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

app.post("/submit", (req, res) =>{
	// res.send(req);
	// console.log(req.params);
	let data = req.body;
	scrape(data.start, data.end);


	// console.log(res);
})
app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});