import './css/main.scss'
import * as THREE from 'three'
import DAT from './js/globe.js'

var container = document.getElementById('container');

var globe = DAT.Globe(container,function(label) {
    return new THREE.Color([0x34cb57, 0x666666, 0xdb0b00][label]);
});

// console.log(globe);

var xhr = new XMLHttpRequest();
xhr.open('GET', './data/space_junk.json', true);

xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);

            globe.addData(data, {format: 'legend'});
            globe.createPoints();

            globe.createNomad(data);
            globe.addNomad();

            globe.animate();

            document.body.style.backgroundImage = 'none'; // remove loading
        }
    }
};

xhr.send(null);
