const fs = require('fs');
const ConfigReader = require('./ConfigReader.js');
const CONFIG = new ConfigReader('franklin');
const ERROR_LOGGER = require("./ErrorLogger.js");

let InfoParser = function(){
	// this.parseAddressPackage = function(addressString){
		
	// 	const streetjson = fs.readFileSync('streetabbreviations.json');
	// 	const statejson = fs.readFileSync('stateabbreviations.json');
	// 	const suffixjson = fs.readFileSync('suffabbreviations.json');
	// 	const TYPES = JSON.parse(streetjson);
	// 	const STATES = JSON.parse(statejson);
	// 	const PRE_SUF = JSON.parse(suffixjson);


	// 	let parsed = addressParser.parseLocation(addressString);	
	// 	console.log(addressString);
	// 	console.log(parsed);
	// 	let editedAddress = {};
	// 	editedAddress.street = '';
	// 	if(num = parsed.number) editedAddress.street += num;
	// 	if(pre = parsed.prefix) editedAddress.street += ' ' + ((pre.toUpperCase() in PRE_SUF) ? PRE_SUF[pre.toUpperCase()].toUpperCase() : pre.toUpperCase());
	// 	if(st = parsed.street) editedAddress.street += ' ' + st;
	// 	if(tp = parsed.type) editedAddress.street += ' ' + ((tp.toUpperCase() in TYPES) ? TYPES[tp.toUpperCase()].toUpperCase() : tp.toUpperCase());
	// 	if(suf = parsed.suffix) editedAddress.street += ' ' + ((suf.toUpperCase() in PRE_SUF) ? PRE_SUF[suf.toUpperCase()].toUpperCase() : suf.toUpperCase());

	// 	if(parsed.sec_unit_type) editedAddress.street += ' ' + parsed.sec_unit_type;
	// 	if(parsed.sec_unit_num) editedAddress.street += ' ' + parsed.sec_unit_num;

	// 	if(city = parsed.city) editedAddress.city = city.toUpperCase();
	// 	if(state = parsed.state) editedAddress.state = (state.toUpperCase() in STATES) ? STATES[state.toUpperCase()].toUpperCase() : state.toUpperCase();
	// 	if(zip = parsed.zip) editedAddress.zip = zip;
		
	// 	console.log(editedAddress);
	// 	return editedAddress;

	// }

	let trimArray = function(array){
		let newArray = [];
		for(let i=0; i < array.length; i++){
			let e = array[i].trim();
			if(e !== '') newArray.push(e);
		}
		return newArray;
	}
	this.parseAddress = function(addressString){
		
		try{
			addressString = addressString.trim();
			
			const streetjson = fs.readFileSync(CONFIG.DEV_CONFIG.STREET_ABBR_FILE);
			const statejson = fs.readFileSync(CONFIG.DEV_CONFIG.STATE_ABBR_FILE);
			const suffixjson = fs.readFileSync(CONFIG.DEV_CONFIG.SUFF_ABBR_FILE);
			const unitjson = fs.readFileSync(CONFIG.DEV_CONFIG.UNIT_ABBR_FILE);
			const TYPES = JSON.parse(streetjson);
			const STATES = JSON.parse(statejson);
			const PRE_SUF = JSON.parse(suffixjson);
			const UNIT = JSON.parse(unitjson);

			let editedAddress = {};

			let addressLines = trimArray(addressString.split(','));

			let regionLine = addressLines.pop();
			let regionLineSplit = trimArray(regionLine.split(' '));

			editedAddress.zip = regionLineSplit.pop();
			let stateAbbr = regionLineSplit.pop();
			if(stateAbbr in STATES){
				editedAddress.state = STATES[stateAbbr];	
			} else {
				editedAddress.state = stateAbbr.toUpperCase();
			}
			
			editedAddress.city = titleCase(regionLineSplit.join(' '));

			let streetLine = ''
			for(let i = 0; i < addressLines.length; i++){
				let split = addressLines[i].split(' ');
				// console.log(split);
				split.forEach(token => {
					token = token.toUpperCase();
					if(token in TYPES){
						streetLine += TYPES[token] +' ';
					} else if(token in PRE_SUF){
						streetLine += PRE_SUF[token] + ' ';
					} else if(token in UNIT){
						streetLine += UNIT[token] + ' ';
					} else {
						streetLine += token + ' ';
					}
				})
			}
			editedAddress.street = titleCase(streetLine);
				
		//	console.log(editedAddress);
			return editedAddress;
		}
		catch(e){
			// console.log(e);
			// console.log('Error on string: ' + addressString);
			return {
				street: addressString,
				city: 'ERR',
				zip: 'ERR',
				state: 'ERR',
			};
		}

	}

	this.parseOwnerNames = function(ownerString){
		function removeElement(arr, el, idx){
			if(idx === undefined) idx = arr.indexOf(el);
			if(idx !== -1){
				return arr.slice(0,idx).concat(arr.slice(idx+1));
			} else {
				return arr;
			}
		}
		const FILTER_WORDS = CONFIG.USER_CONFIG.NAME_FILTER_WORDS;

		// console.log(ownerString);
		
		// console.log(firstOwner);
		try{
			let ownerNames = trimArray(ownerString.split(','));
			// console.log(ownerNames);
			let firstOwner = ownerNames[0];
			if(FILTER_WORDS.some(word => firstOwner.includes(word))) return titleCase(firstOwner);
			let firstOwnerSplit = firstOwner.split(' ');
			firstOwnerSplit.push(firstOwnerSplit.shift())
			if(firstOwnerSplit.includes('TR')){
				firstOwnerSplit = removeElement(firstOwnerSplit, 'TR');
				firstOwnerSplit[firstOwnerSplit.length - 1] = firstOwnerSplit[firstOwnerSplit.length - 1] + ',';
				firstOwnerSplit.push('Trustee');
			} else if(firstOwnerSplit.includes('TRS')){
				firstOwnerSplit = removeElement(firstOwnerSplit, 'TRS');
				firstOwnerSplit[firstOwnerSplit.length - 1] = firstOwnerSplit[firstOwnerSplit.length - 1] + ',';
				firstOwnerSplit.push('Trustees');
			}
			let formattedName = titleCase(firstOwnerSplit.join(' '));
			if(formattedName.includes('Etal') || formattedName.includes('Etalia')){
				formattedName = formattedName.split(' ');
				let etalIdx = formattedName.indexOf('Etal');
				
				etalIdx = etalIdx === -1 ? formattedName.indexOf('Etalia') : etalIdx;
				formattedName = removeElement(formattedName, '', etalIdx)
				if(!isNaN(formattedName[etalIdx])) formattedName = removeElement(formattedName, '', etalIdx)
				formattedName = formattedName.join(' ');

			} else if(formattedName.includes('Et Al')){
				formattedName = formattedName.split(' ');
				let etalIdx = formattedName.indexOf('Et');
				formattedName = removeElement(formattedName, '', etalIdx);
				if(formattedName[etalIdx] === 'Al') formattedName = removeElement(formattedName, '', etalIdx)
				if(!isNaN(formattedName[etalIdx])) formattedName = removeElement(formattedName, '', etalIdx)
				formattedName = formattedName.join(' ');				
			}
			return formattedName;

		}
		catch(e){
			return ownerString;
		}
	}
	let titleCase = function(string){

		const exceptions = CONFIG.USER_CONFIG.TITLECASE_EXCEPTIONS;
		let splitStr = string.toLowerCase().split(' ')
		for (var i = 0; i < splitStr.length; i++) {
			// You do not need to check if i is larger than splitStr length, as your for does that for you
			// Assign it back to the array
			if(exceptions.includes(splitStr[i])) splitStr[i] = splitStr[i].toUpperCase();
			else splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);     
		}
   		return splitStr.join(' ');
   }
}

module.exports = InfoParser;