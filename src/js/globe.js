'use strict';

/**
 * dat.globe Javascript WebGL Globe Toolkit
 * https://github.com/dataarts/webgl-globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import * as THREE from 'three';

var DAT = DAT || {};

var GLOBE_RADIUS = 75;

DAT.Globe = function(container, colorFn) {
    colorFn = colorFn || function(x) {
        var c = new THREE.Color();

        c.setHSL( ( 0.6 - ( x * 0.5 ) ), 1.0, 0.5 );

        return c;
    };

    var Shaders = {
        'earth' : {
            uniforms: {
                'texture': { type: 't', value: null }
            },
            vertexShader: [
                'varying vec3 vNormal;',
                'varying vec2 vUv;',
                'void main() {',
                'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
                'vNormal = normalize( normalMatrix * normal );',
                'vUv = uv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D texture;',
                'varying vec3 vNormal;',
                'varying vec2 vUv;',
                'void main() {',
                'vec3 diffuse = texture2D( texture, vUv ).xyz;',
                'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
                'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
                'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
                '}'
            ].join('\n')
        },
        'atmosphere' : {
            uniforms: {},
            vertexShader: [
                'varying vec3 vNormal;',
                'void main() {',
                'vNormal = normalize( normalMatrix * normal );',
                'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vNormal;',
                'void main() {',
                'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
                'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
                '}'
            ].join('\n')
        }
    };

    var camera, scene, renderer, w, h;
    var mesh, atmosphere, point, sphere;
    var objects = [];

    var overRenderer;

    var imgDir = '../img/';

    var curZoomSpeed = 0;
    var zoomSpeed = 50;

    var mouse = { x: 0, y: 0 };
    var mouseOnDown = { x: 0, y: 0 };
    var rotation = { x: 0, y: 0 };
    var target = { x: Math.PI*3/2, y: Math.PI / 6.0 };
    var targetOnDown = { x: 0, y: 0 };

    var distance = 100000;
    var distanceTarget = 100000;
    var padding = 40;
    var PI_HALF = Math.PI / 2;

    function init() {
        container.style.color = '#fff';
        container.style.font = '13px/20px Arial, sans-serif';

        var shader, uniforms, material;
        w = container.offsetWidth || window.innerWidth;
        h = container.offsetHeight || window.innerHeight;

        camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
        camera.position.z = distance;

        scene = new THREE.Scene();

        var geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 40, 30);

        //Earth
        shader = Shaders['earth'];
        uniforms = THREE.UniformsUtils.clone(shader.uniforms);
        uniforms['texture'].value = new THREE.TextureLoader().load(imgDir + 'world.jpg');
        material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader

        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.y = Math.PI;
        scene.add(mesh);
        objects.push(mesh);

        // Atmosphere
        shader = Shaders['atmosphere'];
        uniforms = THREE.UniformsUtils.clone(shader.uniforms);
        material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true

        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set( 1.1, 1.1, 1.1 );
        scene.add(mesh);
        objects.push(mesh);

        // Point
        geometry = new THREE.CubeGeometry(0.75, 0.75, 1);
        // geometry = new THREE.SphereGeometry(5, 5, 5);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,0,-0.5));

        point = new THREE.Mesh(geometry);
//    point = new THREE.ParticleSystem(geometry);

        // Nomad
        // geometry = new THREE.SphereGeometry(10, 20, 15);
        geometry = new THREE.OctahedronGeometry(10);
        // geometry = new THREE.CubeGeometry(10.75, 10.75, 1);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,0,-0.5));
        sphere = new THREE.Mesh(geometry);

        renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setSize(w, h);

        renderer.domElement.style.position = 'absolute';

        container.appendChild(renderer.domElement);
        container.addEventListener('mousedown', onMouseDown, false);
        container.addEventListener('mousewheel', onMouseWheel, false);

        // console.log(this)
        // var keyDownHandler = onDocumentKeyDown.bind(this);

        document.addEventListener('keydown', onDocumentKeyDown, false);

        window.addEventListener('resize', onWindowResize, false);

        container.addEventListener('mouseover', function() {
            overRenderer = true;
        }, false);

        container.addEventListener('mouseout', function() {
            overRenderer = false;
        }, false);
    }

    function addData(data, opts) {
        var lat, lng, size, color, i, step, colorFnWrapper;

        opts.format = opts.format || 'magnitude';

        if (opts.format === 'magnitude') {
            step = 3;
            colorFnWrapper = function(data, i) { return colorFn(data[i+2]); }
        } else if (opts.format === 'legend') {
            step = 4;
            colorFnWrapper = function(data, i) { return colorFn(data[i+3]); }
        } else {
            throw('error: format not supported: '+opts.format);
        }

        var subgeo = new THREE.Geometry();

        var min_size = 10000000000;
        var max_size = 0;

        var len = data.length;

        for (i = 0; i < len; i += step) {
            lat = data[i];
            lng = data[i + 1];
            color = colorFnWrapper(data,i);
            size = data[i + 2];
            size = size * GLOBE_RADIUS;

            addPoint(lat, lng, size, color, subgeo);

            min_size = Math.min(min_size, size);
            max_size = Math.max(max_size, size);
        }

        this._baseGeometry = subgeo;
    }

    function createPoints() {
        if (this._baseGeometry !== undefined) {
            this.points = new THREE.Mesh(this._baseGeometry,
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    vertexColors: THREE.FaceColors,
                    morphTargets: false
                }));

            scene.add(this.points);
            objects.push(this.points); // push red space debris
        }
    }

    function addNomad() {
        if (this._baseGeometry !== undefined) {
            this.sphere = new THREE.Mesh(this._baseGeometry,
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    vertexColors: THREE.FaceColors,
                    morphTargets: false
                }));

            scene.add(this.sphere);
            objects.push(this.sphere);
        }
    }

    function createNomad(data) {
        var lat, lng, size, color;

        var subgeo = new THREE.Geometry();

        var min_size = 10000000000;
        var max_size = 0;

        var index = 0;

        lat = data[index];
        lng = data[index + 1];
        color = new THREE.Color(0x0000ff);
        size = data[index + 2];
        size = size * GLOBE_RADIUS;

        addSphere(lat, lng, size, color, subgeo);

        min_size = Math.min(min_size, size);
        max_size = Math.max(max_size, size);

        this._baseGeometry = subgeo;
    }

    function addSphere(lat, lng, size, color, subgeo) {
        var delta = 3;

        var phi = (90 - lat - delta) * Math.PI / 180;
        var theta = (180 - lng) * Math.PI / 180;
        var radius = ((1 + (size / 100.0)) * GLOBE_RADIUS);

        sphere.position.x = radius * Math.sin(phi) * Math.cos(theta);
        sphere.position.y = radius * Math.cos(phi);
        sphere.position.z = radius * Math.sin(phi) * Math.sin(theta);

        sphere.lookAt(mesh.position);
        sphere.updateMatrix();

        for (var i = 0, facesLen = sphere.geometry.faces.length; i < facesLen; i++) {
            sphere.geometry.faces[i].color = color;
        }

        // THREE.GeometryUtils.merge(subgeo, sphere);
        subgeo.merge(sphere.geometry, sphere.matrix);
    }

    function addPoint(lat, lng, size, color, subgeo) {
        var phi = (90 - lat) * Math.PI / 180;
        var theta = (180 - lng) * Math.PI / 180;
        var radius = ((1 + (size / 100.0)) * GLOBE_RADIUS);

        point.position.x = radius * Math.sin(phi) * Math.cos(theta);
        point.position.y = radius * Math.cos(phi);
        point.position.z = radius * Math.sin(phi) * Math.sin(theta);

        point.lookAt(mesh.position);
        point.updateMatrix();

        var facesLen = point.geometry.faces.length;

        for (var i = 0; i < facesLen; i++) {
            point.geometry.faces[i].color = color;
        }

        subgeo.merge(point.geometry, point.matrix);
    }

    function onMouseDown(event) {
        event.preventDefault();

        container.addEventListener('mousemove', onMouseMove, false);
        container.addEventListener('mouseup', onMouseUp, false);
        container.addEventListener('mouseout', onMouseOut, false);

        mouseOnDown.x = - event.clientX;
        mouseOnDown.y = event.clientY;

        targetOnDown.x = target.x;
        targetOnDown.y = target.y;

        container.style.cursor = 'move';
    }

    function onMouseMove(event) {
        mouse.x = - event.clientX;
        mouse.y = event.clientY;

        var zoomDamp = distance/1000;

        target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
        target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

        target.y = target.y > PI_HALF ? PI_HALF : target.y;
        target.y = target.y < - PI_HALF ? - PI_HALF : target.y;
    }

    function onMouseUp(event) {
        container.removeEventListener('mousemove', onMouseMove, false);
        container.removeEventListener('mouseup', onMouseUp, false);
        container.removeEventListener('mouseout', onMouseOut, false);
        container.style.cursor = 'auto';
    }

    function onMouseOut(event) {
        container.removeEventListener('mousemove', onMouseMove, false);
        container.removeEventListener('mouseup', onMouseUp, false);
        container.removeEventListener('mouseout', onMouseOut, false);
    }

    function onMouseWheel(event) {
        event.preventDefault();
        if (overRenderer) {
            zoom(event.wheelDeltaY * 0.3);
        }
        return false;
    }

    // KeyDown
    function onDocumentKeyDown(event) {
        let step = 5;
        let nomad = objects[3];
        let phi = 180 / Math.PI * 60;
        let theta = 180 / Math.PI * 60;

        switch(event.code) {
            case "KeyS":
            case "ArrowDown":
                // nomad.position.y -= step;
                nomad.position.y -= Math.sin(theta);

                event.preventDefault();
                break;

            case "KeyW":
            case "ArrowUp":
                // console.log('ArrowUp');

                // console.log(objects);

                // nomad.position.y += step;
                nomad.position.y += Math.sin(theta);

                event.preventDefault();
                break;

            case "KeyA":
            case "ArrowLeft":
                // nomad.position.x -= step;
                nomad.position.x -= Math.sin(phi) * Math.cos(theta);
                // nomad.position.x -= Math.sin(theta);

                break;

            case "KeyD":
            case "ArrowRight":
                // nomad.position.x += step;
                nomad.position.x += Math.sin(phi) * Math.cos(theta);
                // nomad.position.x += Math.sin(theta);

                break;
        }
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( window.innerWidth, window.innerHeight );
    }

    function zoom(delta) {
        distanceTarget -= delta;
        distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
        distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
    }

    function animate() {
        requestAnimationFrame(animate);
        render();
    }

    function render() {
        // console.log('render');

        const canvas = renderer.domElement;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();

        zoom(curZoomSpeed);

        rotation.x += 0.001;

        distance += (distanceTarget - distance) * 0.3;

        let coord = sphereToRect(distance, rotation.x, rotation.y);

        /*camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
        camera.position.y = distance * Math.sin(rotation.y);
        camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);*/

        camera.position.x = coord.x;
        camera.position.y = coord.y;
        camera.position.z = coord.z;

        camera.lookAt(mesh.position);

        renderer.render(scene, camera);
    }

    function sphereToRect(radius, phi, theta) {
        return {
            x: radius * Math.sin(phi) * Math.cos(theta),
            y: radius * Math.sin(theta),
            z: radius * Math.cos(phi) * Math.cos(theta)
        }
    }

    init();
    this.animate = animate;
    animate();

    this.__defineGetter__('time', function() {
        return this._time || 0;
    });

    this.__defineSetter__('time', function(t) {
        var validMorphs = [];
        var morphDict = this.points.morphTargetDictionary;

        for (var k in morphDict) {
            if ( k.indexOf('morphPadding') < 0) {
                validMorphs.push(morphDict[k]);
            }
        }

        validMorphs.sort();

        var l = validMorphs.length-1;
        var scaledt = t*l+1;
        var index = Math.floor(scaledt);

        for (var i = 0, len = validMorphs.length; i < len; i++) {
            this.points.morphTargetInfluences[validMorphs[i]] = 0;
        }

        var lastIndex = index - 1;
        var leftover = scaledt - index;

        if (lastIndex >= 0) {
            this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
        }

        this.points.morphTargetInfluences[index] = leftover;
        this._time = t;
    });

    this.addData = addData;
    this.createPoints = createPoints;
    this.createNomad = createNomad;
    this.addNomad = addNomad;
    this.renderer = renderer;
    this.scene = scene;

    return this;

};

export default DAT;
