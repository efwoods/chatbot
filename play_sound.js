exports.play = function() {
			var Sound = require('node-aplay');

			// fire and forget: 
			//new Sound('/home/efwoods/quantum-chatbot/hello_world.wav').play();
			new Sound('./hello_world.wav').play();
			
			//new Audio('./hello_world.wav').play();
			
			
			console.log('PLAYINGAUDIO---------------------------------------');
			// END SYNTH
}
