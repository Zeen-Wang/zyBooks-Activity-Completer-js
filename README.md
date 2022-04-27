# zyBooks-Activity-Completer-js
zyBooks Completer written in Nodejs with Puppeteer for website automation.

## Setup
1. Install [NodeJs](https://nodejs.org/en/download/current/ "NodeJs")
2. git clone https://github.com/Zeen-Wang/zyBooks-Activity-Completer-js.git
3. npm install

	a. If you want to use a pre-installed version of chrome do "npm install puppeteer-core"
	
	b. Go add your '/path/to/chome' executable into the "complete.js" file
	
4. add personal credentials to config.json

	a. Choose what chapters to complete
	
	b. Specify exact zyBook name
```javascript
{
	"email": "yourid@rose-hulman.edu",
	"pass": "put your password",
	"zybook": "ROSEHULMANCSSE280Spring2022",
	"chaptersToComplete": [3, 4, 8, 10, 12, 13]
}
```

## Run

`npm start` or `./complete.js`

If you want to change the options of puppeteer then go into complete.js file and change:

`const selected_config = puppetConfig || puppetConfigDebug`
		
or add your own config settings
