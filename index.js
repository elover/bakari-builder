#!/usr/bin/env node
// ==================================================
// bakariBuilder 0.0.5 @dev
// ==================================================
'use strict';
var startTime = +new Date();
var chalk = require('chalk'),
	inquirer = require('inquirer'),
	moment = require('moment'),
	program = require('commander'),
	shell = require('shelljs'),
	grunt = require('grunt'),
	bower = require('bower'),
	_ = require('underscore'),
	Promise = require('bakari-promise'),
	extend = require('extend'),
	resetBowerConfig = require('./node_modules/bower/lib/config').reset,
	gulp = require('gulp');

	// demand loading gulp libs
	// concat = require('gulp-concat'),
	// uglify = require('gulp-uglify'),
	// jshint = require('gulp-jshint'),
 //    rename = require('gulp-rename'),
 //    livereload = require('gulp-livereload'),
 //    header = require('gulp-header'),
 //    footer = require('gulp-footer');

// ==================================================
// builder config
// ==================================================
var builder = {

	// js root path
	jsPath : '/script',

	// js 目录 相对于jsPath
	jsDir : {

		dev : '/dev',
		pro : '/pro',

		src : '/src',
		lib : '/src/lib',
		biz : '/src/biz'

	},

	// bower config
	bowerrcPath : '/.bowerrc',

	// builder config path
	builderPath : '/.bakari-builder',

	// libs config file
	libConfig : '/.bakari-builder/libs',

	// biz config file
	bizConfig : '/.bakari-builder/biz',

	// project config file
	projectConfig : '/.bakari-builder/project.json',

	// biz template
	biztpl : '/.biztpl'

};

// ==================================================
// project config
// ==================================================
var project = {

	// 项目名称
	name : null,

	// 项目根目录
	rootPath : null,

	// 初始化js
	initJs : null,

	// 项目js目录
	jsPath : null,

	// 配置最后更新
	lastupdate : null,

	// lib信息 @notsave
	libs : {}

};

// ==================================================
// biz config
// ==================================================
var bizDefaultConfig = {

	// page id
	pageId : '',

	// extend page id
	extendPage : '',

	// js files path 
	path : '',

	// page note
	note : '',

	// rely libs
	libs : []

};

// ==================================================
// bowerrc config
// ==================================================
var bowerrc = {
	directory : null
};

// ==================================================
// helper
// ==================================================
var helper = {

	log : function( status, msg ){
		
		console.log( chalk.red('bakari ') + chalk.green(status.toLocaleUpperCase()+' ') + (msg || '') );

		if ( status.toLowerCase() === 'error' ) {
			commandDone();
		}

	},

	// save project config
	saveProjectConfig : function(){
		delete project.libs;
		project.lastupdate = moment().format('YYYY-MM-DD HH:mm:ss');
		grunt.file.write( project.rootPath+builder.projectConfig, JSON.stringify( project ) );
	},

	firstToUpperCase : function( string ){
		return string.slice(0,1).toUpperCase() + string.slice(1,string.length);
	},

	firstToLowerCase : function( string ){
		return string.slice(0,1).toLowerCase() + string.slice(1,string.length);
	},

	dashToHump : function( string ){
		
		var wordList = string.split('/');

	    // if split the array length is 1, return original string
	    if ( wordList.length === 1 ) {
	        return string;
	    }

	    for ( var i=0; i < wordList.length; i++ ){
	        wordList[i] = helper.firstToUpperCase(wordList[i]);
	    }

	    wordList[0] = helper.firstToLowerCase( wordList[0] );

	    return wordList.join('');

	},

	// check biz rely
	// input a page id, detecting whether there is dependent business logic 
	checkBizRely : function( pageid ){

		var rely = [];
		grunt.file.recurse( project.rootPath+builder.bizConfig, function(abspath, rootdir, subdir, filename){

			var json = grunt.file.readJSON(abspath);

			if ( json.extendPage === pageid ) {
				rely.push({
					path : json.path,
					pageId : json.pageId
				});
			}

		});

		return rely;
		
	},

	// get biz page config path
	getBizConfigPath : function( pageid ){
		
		return project.rootPath+builder.bizConfig+'/'+pageid.split(/[A-Z]/g)[0]+'/'+pageid+'.json';

	},

	// get some biz page config
	getBizConfig : function( pageid ){
		
		var config = {},
			src = helper.getBizConfigPath( pageid );

		if ( grunt.file.exists(src) ) {
			config = grunt.file.readJSON(src);
		}
		
		return config;

	},

	// check some page id is exist
	hasPageid : function( pageid ){
		
		var find = false;
		grunt.file.recurse( project.rootPath+builder.bizConfig, function(abspath, rootdir, subdir, filename){

			var page = filename.replace(/\.json$/g, '');
			if ( page === pageid ) {
				find = true;
			}

		});

		return find;

	}

};


// ==================================================
// lib function
// ==================================================
var lib = {

	// search package information by name
	search : function( libs ){
		
		var promise = Promise(),
			info = {},
			num = libs.length;

		_.each( libs, function(v,k){
			
			helper.log('search', v);

			bower.commands
			.info(v)
			.on('end', function (results) {

				var pkg = results.name,
					version = results.versions[0]; //取最新版本

				info[pkg] = {};
				info[pkg][version] = {
					dir : pkg + '-' + version,
					version : version,
					pkg : pkg
				}

				if ( !--num ) {
					promise.resolve( info );
				}

			})
			.on('error', function(){

				helper.log('error', v + ' : ' + error.details);

				if ( !--num ) {
					promise.resolve();
				}

			});

		});

		return promise;

	},

	// install package
	install : function( libs, cfg ){

		cfg = extend(true, {
			note : 'installed',
			showGet : true
		}, cfg);

		var promise = Promise(),
			num = 0;

		// if libs is null
		if ( !libs ) {
			promise.resolve();
			return;
		}

		_.each(libs, function(lv){
			_.each(lv, function(v,k){

				num++;
			
				var installName = v.dir+'='+v.pkg+'#'+v.version;

				bower.commands
				.install([installName], { save: true }, {})
				.on('log', function( data ){
					if ( data.level === 'info' && cfg.showGet  ) {
						helper.log('get', v.pkg+'#'+v.version + ' : ' + data.message);
					}
				})
				.on('end', function(installed){

					_.find(installed, function(){

						helper.log( cfg.note, v.pkg + '@' + v.version );

						// set config
						grunt.file.mkdir(project.rootPath + builder.libConfig + '/' + v.pkg);
						grunt.file.write(project.rootPath + builder.libConfig + '/' + v.pkg + '/' + v.version + '.json', JSON.stringify(v));

						return true;

					});

					if ( !--num ) {
						promise.resolve();
					}

				})
				.on('error', function(error){

					helper.log('error', v.pkg + '#' + v.version + ' : ' + error.details);

					if ( !--num ) {
						promise.resolve();
					}

				});

			});
		});

		return promise;

	},

	// uninstall package
	uninstall : function( libs, cfg ){
		
		cfg = extend(true, {
			note : 'uninstalled'
		}, cfg);

		var promise = Promise(),
			num = 0;

		// if libs is null
		if ( !libs ) {
			promise.resolve();
			return;
		}

		_.each(libs, function(lv){
			_.each(lv, function(v,k){

				num++;

				bower.commands
				.uninstall([v.dir], { save: true }, {})
				.on('end', function(uninstall){

					// set config
					var libConfig = project.rootPath + builder.libConfig + '/' + v.pkg + '/' + v.version + '.json',
						libDir = project.rootPath + builder.libConfig + '/' + v.pkg,
						libNum = 0;

					if ( grunt.file.exists(libDir) ) {

						if ( grunt.file.exists(libConfig) ) {
							grunt.file.delete(libConfig);
							helper.log( cfg.note, v.pkg + '@' + v.version );
						} else {
							helper.log( 'error', 'project not install ' + v.pkg + '@' + v.version );
						}

						grunt.file.recurse( libDir, function(abspath, rootdir, subdir, filename){
							libNum++;
						});

						if ( libNum === 0 ) {
							grunt.file.delete(libDir);
						}

					} else {
						helper.log( 'error', 'project not install ' + v.pkg );
					}
					
					if ( !--num ) {
						promise.resolve();
					}

				})
				.on('error', function(error){

					helper.log('error', v.pkg + '#' + v.version + ' : ' + error.details);
					
					if ( !--num ) {
						promise.resolve();
					}

				});

			});
		});

		return promise;

	},

	// uninstall all package
	uninstallAll : function( cfg ){
		// TODO
	},

};

var cli = {};

// ==================================================
// loading project
// ==================================================
// load project config
if ( grunt.file.exists( shell.pwd() + builder.projectConfig ) ){
	project = extend( true, project, grunt.file.readJSON( shell.pwd() + builder.projectConfig ) );
}

// load libs config
if ( grunt.file.exists( shell.pwd() + builder.libConfig ) ) {

	grunt.file.recurse( shell.pwd() + builder.libConfig, function(abspath, rootdir, subdir, filename){

		if ( project.libs[subdir] === undefined ) {
			project.libs[subdir] = {};
		}

		project.libs[subdir][filename.replace(/\.json$/,'')] = grunt.file.readJSON( abspath );
		
	});

}

// ==================================================
// gulp task
// ==================================================
var taskConfig = {};

// defautl task
gulp.task('default', function(){
	console.log('test!');
});

// concat task
taskConfig.concat = {
	src : null,
	dest : null,
	file : null,
};
gulp.task('concat', function(){

	if ( taskConfig.concat.src === null ||
		 taskConfig.concat.dest === null ||
		 taskConfig.concat.file === null ) {
		helper.log('error', 'task concat src or dest or file is null');
		return;
	}
	
	gulp.src(taskConfig.concat.src)
		.pipe(concat(taskConfig.concat.file))
        // .pipe(header(bakariHeader))
        // .pipe(footer(bakariFooter))
		// .pipe(jshint(false))
		// .pipe(jshint.reporter('default'))
		.pipe(gulp.dest(taskConfig.concat.dest));

});


// ==================================================
// command
// ==================================================
// command done
var commandDone = function(){
	if ( program.timing ) {
		var runTime = +new Date() - +startTime;
		helper.log('runtime', runTime+'ms');
	}
};

// init @early
cli.init = function(){
		
	var promise = Promise();
	promise.done(function(){
		helper.saveProjectConfig();
		helper.log('initialization complete', '');
	});

	inquirer.prompt([
		{
			name : 'rootPath',
			type : 'input',
			message : 'project path:',
			default : '.'
		},
		{
			name : 'projectName',
			type : 'input',
			message : 'project name:',
			default : project.name
		},
		{
			name : 'initJs',
			type : 'confirm',
			message : 'init javascript?',
			default : (project.initJs === null ) ? true : project.initJs
		},
		{
			name : 'jsPath',
			type : 'input',
			message : 'javascript path:',
			default : builder.jsPath,
			when : function(answers){
				return answers.initJs;
			}
		},
		{
			name : 'libs',
			type : 'checkbox',
			message : 'use lib:',
			choices : [
				'jquery',
				'underscore',
				'js-md5',
				'json3',
				'moment',
				'js-base64',
				'jquery.cookie'
			],
			default : _.keys(project.libs),
			when : function(answers){
				return answers.jsPath;
			}
		}
		// {
		// 	name : 'initJavascript',
		// 	type : 'confirm',
		// 	message : 'init javascript?',
		// 	default : (buildConfig.initJs === null ) ? true : buildConfig.initJs
		// },
		// 
	], function( answers ) {

		// get project root path
		project.rootPath = answers.rootPath;

		// make dir
		grunt.file.mkdir( project.rootPath+builder.builderPath );

		// make lib config dir
		grunt.file.mkdir( project.rootPath+builder.libConfig );

		// get project name
		project.name = answers.projectName;

		// set project js path
		project.jsPath = answers.jsPath || builder.jsPath;

		// set init js
		project.initJs = answers.initJs;

		// make js dir
		if ( answers.initJs && answers.jsPath ) {
			_.each( builder.jsDir, function(v){
				grunt.file.mkdir( project.rootPath+project.jsPath+v );
			});
		}

		// make bowerrc & libs
		if ( answers.libs && answers.libs.length > 0 ) {

			bowerrc.directory = '.' + project.jsPath + builder.jsDir.lib;
			grunt.file.write( project.rootPath+builder.bowerrcPath, JSON.stringify(bowerrc) );
			resetBowerConfig();

			lib
			.search( answers.libs )
			.done(function(data){
				lib
				.install(data)
				.done(function(){
					promise.resolve();
				});
			});

		} else {
			promise.resolve();
		}

	});
	
	promise.done(commandDone);
	return promise;

};
program
	.command('init')
	.description('init project')
	.action(cli.init);

// clean @early
cli.clean = function(){
	
	var promise = Promise();
	promise.done(function(){
		helper.log('project cleared');
	});
	
	// reset bowerrc
	bowerrc.directory = '.' + project.jsPath + builder.jsDir.lib;
	grunt.file.write( project.rootPath+builder.bowerrcPath, JSON.stringify(bowerrc) );
	resetBowerConfig();
	helper.log('cleared', '.bowerrc');

	// reset libs
	cli.cleanlib()
	.done(function(){

		// clean biz
		cli.cleanbiz()
		.done(function(){
			promise.resolve();
		});

	});

	promise.done(commandDone);
	return promise;

};
program
	.command('clean')
	.description('clean project')
	.action(cli.clean)

// test @early
cli.test = function(){

	var promise = Promise();

	gulp.start('default');
	helper.log('run test');

	promise.done(commandDone).resolve();
	return promise;

};
program
	.command('test')
	.description('just test builder')
	.action(cli.test);

// addlib @early
cli.addlib = function(name){
	
	// check name
	if ( typeof name !== 'string' ) {
		helper.log('error', 'you must input a package name');
		return;
	}

	var version, promise = Promise();

	if ( arguments[1].parent.useVersion ) {
		version = arguments[1].parent.useVersion
	}

	if ( version ) {

		var data = {};
		data[name] = {};
		data[name][version] = {
			dir : name + '-' + version,
			pkg : name,
			version : version
		};

		lib
		.install(data)
		.done(function(){
			promise.resolve();
		})

	} else {

		lib
		.search([name])
		.done(function(data){
			lib
			.install(data)
			.done(function(){
				promise.resolve();
			})
		})
		.fail(function(){
			helper.log('error', 'not found lib : '+name);
			promise.resolve();
		})

	}

	promise.done(commandDone);
	return promise;

};
program
	.command('addlib')
	.description('add a package for project')
	.action(cli.addlib); 

// rmlib @early
cli.rmlib = function(name){

	// check name
	if ( typeof name !== 'string' ) {
		helper.log('error', 'you must input a package name');
		return;
	}

	var version, promise = Promise();

	if ( arguments[1].parent.useVersion ) {
		version = arguments[1].parent.useVersion
	}

	if ( version ) {

		var data = {};
		data[name] = {};
		data[name][version] = {
			dir : name + '-' + version,
			pkg : name,
			version : version
		};
		lib.uninstall(data)
		.done(function(){
			promise.resolve();
		});

	} else {

		var data = {};
		data[name] = project.libs[name];

		if ( data[name] === undefined ) {
			helper.log('error', 'project not install '+name+'.');
			return;
		}

		lib.uninstall(data)
		.done(function(){
			promise.resolve();
		});

	}

	promise.done(commandDone);
	return promise;

};
program
	.command('rmlib')
	.description('remove a package from project')
	.action(cli.rmlib);

// cleanlib @early
cli.cleanlib = function(){

	var promise = Promise();
	promise.done(function(){
		helper.log('lib cleared');
	});

	// reset libs
	var jsLibPath = project.rootPath + project.jsPath + builder.jsDir.lib;
	if ( grunt.file.exists( jsLibPath ) )
	grunt.file.delete( jsLibPath );

	lib
	.install(project.libs, {
		showGet : false,
		note : 'cleared'
	})
	.done(function(){
		promise.resolve();
	});

	promise.done(commandDone);
	return promise;

};
program
	.command('cleanlib')
	.description('clean libs')
	.action(cli.cleanlib);

// liblist @early
cli.liblist = function(){

	var promise = Promise();

	console.log('project ' + chalk.cyan( project.name ) + '\t' + project.rootPath + project.jsPath + builder.jsDir.lib );

	var libs = [];
	_.each( project.libs, function(lv){
		_.each( lv, function(v,k){
			libs.push(v.pkg + '@' + v.version);
		});
	});

	_.each( libs, function(v,k){
		if ( (k+1) === libs.length ) {
			console.log( '└──' + v );	
		} else {
			console.log( '├──' + v );	
		}
	});

	promise.done(commandDone).resolve();
	return promise;

};
program
	.command('liblist')
	.description('package info')
	.action(cli.liblist);

// addbiz @early
cli.addbiz = function( page ){

	var promise = Promise(),
		pageId = helper.dashToHump(page),
		hasLibs = [],
		file = '',
		path = page.split('/');


	_.each( project.libs, function(lv){
		_.each( lv, function(v,k){
			hasLibs.push(v.pkg+'@'+v.version);
		});
	});

	inquirer.prompt([
		{
			name : 'checkPath',
			type : 'confirm',
			message : 'biz path:' + page
		},
		{
			name : 'pageId',
			type : 'input',
			message : 'page id:',
			default : pageId,
			when : function(answers){
				return answers.checkPath;
			}
		},
		{
			name : 'extendPage',
			type : 'input',
			message : 'extend page id:',
			default : pageId.replace(/[A-Z][a-z0-9_]+?$/g, ''),
			when : function(answers){
				return answers.pageId;
			}
		},
		{
			name : 'useLibs',
			type : 'checkbox',
			message : 'use lib:',
			choices : hasLibs,
			when : function(answers){
				return answers.extendPage;
			}
		},
		{
			name : 'note',
			type : 'input',
			message : 'page note:',
			when : function(answers){
				return answers.extendPage;
			}

		}
	], function( answers ) {

		promise.done(function(){
			helper.log('added', answers.pageId + '\t:\t' + src);
		});

		var src = project.rootPath+builder.jsPath+builder.jsDir.biz+'/'+path[0]+'/'+answers.pageId+'.js';

		// check file exists
		if ( grunt.file.exists( src ) ) {
			helper.log('error', src+' is already exists');
			return;
		}

		// check extend page
		if ( !helper.hasPageid( answers.extendPage ) ) {
			helper.log('error', 'parent page : '+answers.extendPage+' is not found');
			return;
		}

		if ( grunt.file.exists( project.rootPath+builder.biztpl ) ) {
			file = grunt.file.read( project.rootPath+builder.biztpl );
		}

		// render
		file = file.replace(/\{\{pageId\}\}/g, answers.pageId);
		file = file.replace(/\{\{extendPage\}\}/g, answers.extendPage);

		// make file
		grunt.file.write( src, file );

		// get libs
		var libs = [];
		_.each( answers.useLibs, function(v,k){
			
			var str = v.split('@');
			libs.push({
				pkg : str[0],
				version : str[1],
				dir : str[0]+'-'+str[1]
			});

		});

		// make config
		var biz = extend( true, bizDefaultConfig, {
			pageId : pageId,
			path : src,
			extendPage : answers.extendPage,
			libs : libs
		});

		// save config
		grunt.file.write( helper.getBizConfigPath(answers.pageId), JSON.stringify(biz) );

		promise.resolve();
		
	});
	
	promise.done(commandDone);
	return promise;

};
program
	.command('addbiz')
	.description('add business code')
	.action(cli.addbiz);


// setbiz
cli.setbiz = function( pageid ){
	
	var promise = Promise(),
		config = helper.getBizConfig( pageid ),
		libs = [],
		hasLibs = [];

	promise.done(function(){
		helper.log('set success');
	});

	// check page id
	if ( _.isEmpty(config) ) {
		helper.log('error', 'not found '+pageid);
		return;
	}

	_.each( config.libs, function(lv){
		libs.push( lv.pkg+'@'+lv.version );
	});

	_.each( project.libs, function(lv){
		_.each( lv, function(v,k){
			hasLibs.push(v.pkg+'@'+v.version);
		});
	});

	inquirer.prompt([
		{
			name : 'pageId',
			type : 'input',
			message : 'page id:',
			default : config.pageId
		},
		{
			name : 'extendPage',
			type : 'input',
			message : 'extend page id:',
			default : config.extendPage,
			when : function(answers){
				return answers.pageId;
			}
		},
		{
			name : 'useLibs',
			type : 'checkbox',
			message : 'use lib:',
			choices : hasLibs,
			default : libs,
			when : function(answers){
				return answers.extendPage;
			}
		},
		{
			name : 'note',
			type : 'input',
			message : 'page note:',
			default : config.note,
			when : function(answers){
				return answers.extendPage;
			}

		}
	], function( answers ) {

		var file = '',
			path = answers.pageId.split(/[A-Z]/g),
			src = project.rootPath+builder.jsPath+builder.jsDir.biz+'/'+path[0]+'/'+answers.pageId+'.js';

		// check extend page
		if ( !helper.hasPageid( answers.extendPage ) ) {
			helper.log('error', 'parent page : '+answers.extendPage+' is not found');
			return;
		}

		// if pageid change need check child page
		if ( answers.pageId !== config.pageId && helper.checkBizRely(config.pageId).length > 0 ) {
			helper.log('error', config.pageId + ' has child page, can\'t change page id');
			return;
		}

		// get js file content
		if ( grunt.file.exists( config.path ) ) {
			
			var reg = new RegExp('^(B\.)'+config.pageId+'( \= B.)'+config.extendPage, 'g');
			file = grunt.file.read( config.path );
			file = file.replace(reg, '$1{{pageId}}$2{{extendPage}}');

		} else {
			// if can't find js file
			file = grunt.file.read( project.rootPath+builder.biztpl );
		}

		// render
		file = file.replace(/\{\{pageId\}\}/g, answers.pageId);
		file = file.replace(/\{\{extendPage\}\}/g, answers.extendPage);

		// make file
		grunt.file.write( src, file );

		// if page id cahnge, delete old file
		if ( answers.pageId !== config.pageId &&
			 grunt.file.exists( config.path ) ) {
			grunt.file.delete( config.path );
		}

		// get libs
		var libs = [];
		_.each( answers.useLibs, function(v,k){
			
			var str = v.split('@');
			libs.push({
				pkg : str[0],
				version : str[1],
				dir : str[0]+'-'+str[1]
			});

		});
		
		// if page id change, change config
		if ( answers.pageId !== config.pageId ) {
			grunt.file.delete( helper.getBizConfigPath(config.pageId) );
		}

		// make config
		var biz = extend( true, config, {
			pageId : answers.pageId,
			path : src,
			extendPage : answers.extendPage,
			libs : libs
		});

		// save config
		grunt.file.write( helper.getBizConfigPath(answers.pageId), JSON.stringify(biz) );

		promise.resolve();

	});
	
	promise.done(commandDone);
	return promise;

};
program
	.command('setbiz')
	.description('set biz config')
	.action(cli.setbiz);


// rmbiz
cli.rmbiz = function( pageid ){
	
	var promise = Promise();

	promise.done(function(){
		helper.log('removed', pageid);
	});

	// check child biz page
	var child = helper.checkBizRely( pageid );

	if ( child.length > 0 ) {
		helper.log('error', 'this page contains sub-pages:');
		_.each(child, function(v){
			console.log( v.pageId+' : '+v.path );
		});
		return;
	}

	inquirer.prompt([
		{
			name : 'recheck',
			type : 'confirm',
			message : 'remove page : ' + pageid
		}
	], function(){

		// get page config
		var config = helper.getBizConfig( pageid );
		
		// remove biz page
		grunt.file.delete( config.path );
		helper.log('delete', config.path);

		// remove config
		grunt.file.delete( helper.getBizConfigPath(pageid) );
		helper.log('delete', pageid+' config');

		promise.resolve();

	});

	promise.done(commandDone);
	return promise;

};
program
	.command('rmbiz')
	.description('remove business code')
	.action(cli.rmbiz);


// bizlist
cli.bizlist = function(){
	
	var promise = Promise(),
		list = [];

	console.log('project ' + chalk.cyan( project.name ) + '\t' + project.rootPath + project.jsPath + builder.jsDir.biz );

	// get all biz
	grunt.file.recurse( project.rootPath+builder.bizConfig, function(abspath, rootdir, subdir, filename){
		list.push( helper.getBizConfig(filename.replace(/\.json$/g, '')) );
	});

	_.each( list, function(v,k){
		if ( (k+1) === list.length ) {
			console.log( '└──' + v.pageId + ' ~ ' + v.extendPage );
		} else {
			console.log( '├──' + v.pageId + ' ~ ' + v.extendPage );
		}
	});

	promise.done(commandDone).resolve();
	return promise;

};
program
	.command('bizlist')
	.description('show all biz')
	.action(cli.bizlist);


// seebiz
cli.seebiz = function( pageid ){
	
	var promise = Promise(),
		detail = helper.getBizConfig(pageid);

	console.log('biz '+chalk.cyan( detail.pageId ));
	_.each(detail, function(v,k){
		
		if ( typeof v === 'string' ) {
			console.log( k + ' : ' + v );
		} else if ( k === 'libs' ) {

			var libs = [];
			_.each( v, function(lv){
				libs.push( lv.pkg+'@'+lv.version );
			});

			console.log( k + ' : ' + libs.join(' | ') );

		} else if ( _.isArray(v) ) {
			console.log( k + ' : ' + v.join(' | ') );
		}
		
	});

	promise.done(commandDone).resolve();
	return promise;

};
program
	.command('seebiz')
	.description('show biz detail')
	.action(cli.seebiz);


// cleanbiz
cli.cleanbiz = function(){
	
	var promise = Promise(),
		excessPromise = Promise(),
		bizSrc = project.rootPath + builder.jsPath + builder.jsDir.biz,
		excess = [],
		hasFiles = [],
		pageid;

	promise.done(function(){
		helper.log('cleared all biz js files');
	});

	// get excess js files
	grunt.file.recurse( bizSrc, function(abspath, rootdir, subdir, filename){
		
		pageid = filename.replace(/\.js$/g, '');
		if ( !helper.hasPageid( pageid ) ) {
			excess.push(abspath);
		}
		hasFiles.push(pageid);

	});

	// clean excess js files
	inquirer.prompt([
		{
			name : 'cleanBizs',
			type : 'checkbox',
			message : 'need delete excess js files:',
			choices : excess,
			default : excess,
			when : function(){
				if ( !excess.length ) {
					excessPromise.resolve();
				}
				return excess.length;
			}
		}
	], function( answers ) {
		
		_.each( answers.cleanBizs, function(v){
			
			grunt.file.delete( v );
			helper.log('delete', v );

		});

		excessPromise.resolve();

	});

	excessPromise.done(function(){
		
		// add missing js files
		grunt.file.recurse( project.rootPath + builder.bizConfig, function(abspath, rootdir, subdir, filename){

			var find = false;
			pageid = filename.replace(/\.json$/g, '');
			_.find( hasFiles, function(v){
				if ( v === pageid ) {
					find = true;
					return;
				}
			});

			// if not find js file
			if ( !find ) {

				var file = '',
					config = helper.getBizConfig(pageid);

				// add missing file
				if ( grunt.file.exists( project.rootPath+builder.biztpl ) ) {
					file = grunt.file.read( project.rootPath+builder.biztpl );
				}

				// render
				file = file.replace(/\{\{pageId\}\}/g, config.pageId);
				file = file.replace(/\{\{extendPage\}\}/g, config.extendPage);

				// make file
				grunt.file.write( config.path, file );

				helper.log('added', config.pageId + '\t:\t' + config.path);

			}

		});

		promise.resolve();

	});

	promise.done(commandDone);
	return promise;

};
program
	.command('cleanbiz')
	.description('clean all biz js file')
	.action(cli.cleanbiz);


// build
cli.build = function(){

	var promise = Promise();

	promise.done(commandDone);
	return promise;

};
program
	.command('build')
	.description('build development and production file')
	.action(cli.build);


// ==================================================
// option
// ==================================================
program.option('-v, --use-version <version>', 'specify a version');
// program.option('-e, --env', 'set development(dev) or production(pro) environment');
program.option('-t, --timing', 'uptime statistics');

// ==================================================
// program
// ==================================================
program.version('0.0.5');
program.command('*').description('').action(commandDone);
program.parse(process.argv);

// check null command
var nullCommand = true;
_.each(process.argv, function(v,k){
	if ( k !== 0 &&
		 k !== 1 &&
		 v.search('-') !== 0 ) {
		nullCommand = false;
	}
});

if ( nullCommand ) {
	commandDone();
}
