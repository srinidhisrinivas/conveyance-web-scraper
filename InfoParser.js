const fs = require('fs');
let InfoParser = function(){
	this.parseAddress = function(addressString){
		
		const streetjson = fs.readFileSync('streetabbreviations.json');
		const statejson = fs.readFileSync('stateabbreviations.json');
		const suffixjson = fs.readFileSync('suffabbreviations.json');
		const TYPES = JSON.parse(streetjson);
		const STATES = JSON.parse(statejson);
		const PRE_SUF = JSON.parse(suffixjson);


		let parsed = addressParser.parseLocation(addressString);	
		console.log(addressString);
		console.log(parsed);
		let editedAddress = {};
		editedAddress.street = '';
		if(num = parsed.number) editedAddress.street += num;
		if(pre = parsed.prefix) editedAddress.street += ' ' + ((pre.toUpperCase() in PRE_SUF) ? PRE_SUF[pre.toUpperCase()].toUpperCase() : pre.toUpperCase());
		if(st = parsed.street) editedAddress.street += ' ' + st;
		if(tp = parsed.type) editedAddress.street += ' ' + ((tp.toUpperCase() in TYPES) ? TYPES[tp.toUpperCase()].toUpperCase() : tp.toUpperCase());
		if(suf = parsed.suffix) editedAddress.street += ' ' + ((suf.toUpperCase() in PRE_SUF) ? PRE_SUF[suf.toUpperCase()].toUpperCase() : suf.toUpperCase());

		if(parsed.sec_unit_type) editedAddress.street += ' ' + parsed.sec_unit_type;
		if(parsed.sec_unit_num) editedAddress.street += ' ' + parsed.sec_unit_num;

		if(city = parsed.city) editedAddress.city = city.toUpperCase();
		if(state = parsed.state) editedAddress.state = (state.toUpperCase() in STATES) ? STATES[state.toUpperCase()].toUpperCase() : state.toUpperCase();
		if(zip = parsed.zip) editedAddress.zip = zip;
		
		console.log(editedAddress);
		return editedAddress;

	}

	let trimArray = function(array){
		let newArray = [];
		for(let i=0; i < array.length; i++){
			let e = array[i].trim();
			if(e !== '') newArray.push(e);
		}
		return newArray;
	}
	this.parseAddress2 = function(addressString){
		
		try{
		addressString = addressString.trim();
	//	console.log(addressString);
		
		const streetjson = fs.readFileSync('streetabbreviations.json');
		const statejson = fs.readFileSync('stateabbreviations.json');
		const suffixjson = fs.readFileSync('suffabbreviations.json');
		const TYPES = JSON.parse(streetjson);
		const STATES = JSON.parse(statejson);
		const PRE_SUF = JSON.parse(suffixjson);

		let editedAddress = {};

		let addressLines = trimArray(addressString.split(','));

		let regionLine = addressLines.pop();
		let regionLineSplit = trimArray(regionLine.split(' '));

		editedAddress.zip = regionLineSplit.pop();
		let stateAbbr = regionLineSplit.pop();
		if(stateAbbr in STATES){
			editedAddress.state = STATES[stateAbbr].toUpperCase();	
		} else {
			editedAddress.state = stateAbbr.toUpperCase();
		}
		
		editedAddress.city = regionLineSplit.join(' ');

		let streetLine = ''
		for(let i = 0; i < addressLines.length; i++){
			let split = addressLines[i].split(' ');
			// console.log(split);
			split.forEach(token => {
				token = token.toUpperCase();
				if(token in TYPES){
					streetLine += TYPES[token] +' ';
				} else if(token in PRE_SUF){
					streetLine += PRE_SUF[token].toUpperCase() + ' ';
				} else {
					streetLine += token + ' ';
				}
			})
		}
		editedAddress.street = streetLine;
			
	//	console.log(editedAddress);
		return editedAddress;
		}
		catch(e){
			console.log(e);
			console.log('Error on string: ' + addressString);
			return {
				street: addressString,
				city: 'ERR',
				zip: 'ERR',
				state: 'ERR',
			};
		}

	}

	this.parseOwnerNames = function(ownerString){
		const FILTER_WORDS = ['COMPANY', ' LLC', ' BANK', ' TRUST', ' INC'];

		// console.log(ownerString);
		
		// console.log(firstOwner);
		try{
			let ownerNames = trimArray(ownerString.split(','));
			// console.log(ownerNames);
			let firstOwner = ownerNames[0];
			if(FILTER_WORDS.some(word => firstOwner.includes(word))) return firstOwner;
			let firstOwnerSplit = firstOwner.split(' ');
			firstOwnerSplit.push(firstOwnerSplit.shift())
			return firstOwnerSplit.join(' ');
		}
		catch(e){
			return ownerString;
		}
	}
}

module.exports = InfoParser;