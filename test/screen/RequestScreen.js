'use strict';

import globals from '../../src/globals/globals';
import RequestScreen from '../../src/screen/RequestScreen';

describe('RequestScreen', function() {

	beforeEach(function() {
		this.xhr = sinon.useFakeXMLHttpRequest();

		var requests = this.requests = [];

		this.xhr.onCreate = function(xhr) {
			requests.push(xhr);
		};
	});

	afterEach(function() {
		this.xhr.restore();
	});

	it('should be cacheable', function() {
		var screen = new RequestScreen();
		assert.ok(screen.isCacheable());
	});

	it('should set HTTP method', function() {
		var screen = new RequestScreen();
		assert.strictEqual(RequestScreen.GET, screen.getHttpMethod());
		screen.setHttpMethod(RequestScreen.POST);
		assert.strictEqual(RequestScreen.POST, screen.getHttpMethod());
	});

	it('should set HTTP headers', function() {
		var screen = new RequestScreen();
		assert.deepEqual({
			'X-PJAX': 'true',
			'X-Requested-With': 'XMLHttpRequest'
		}, screen.getHttpHeaders());
		screen.setHttpHeaders({});
		assert.deepEqual({}, screen.getHttpHeaders());
	});

	it('should set timeout', function() {
		var screen = new RequestScreen();
		assert.strictEqual(30000, screen.getTimeout());
		screen.setTimeout(0);
		assert.strictEqual(0, screen.getTimeout());
	});

	it('should screen beforeUpdateHistoryPath returns response path if different from navigate path', function() {
		var screen = new RequestScreen();
		sinon.stub(screen, 'getRequestResponsePath', function() {
			return '/redirect';
		});
		assert.strictEqual('/redirect', screen.beforeUpdateHistoryPath('/path'));
	});

	it('should screen beforeUpdateHistoryState returns null if form navigate to post-without-redirect-get', function() {
		var screen = new RequestScreen();
		assert.strictEqual(null, screen.beforeUpdateHistoryState({
			senna: true,
			form: true,
			navigatePath: '/post',
			path: '/post'
		}));
	});

	it('should request response path return null if no requests were made', function() {
		var screen = new RequestScreen();
		assert.strictEqual(null, screen.getRequestResponsePath());
	});

	it('should send request to an url', function(done) {
		var screen = new RequestScreen();
		screen.load('/url').then(function() {
			assert.strictEqual('/url', screen.getRequest().url);
			assert.deepEqual({
				'X-PJAX': 'true',
				'X-Requested-With': 'XMLHttpRequest'
			}, screen.getRequest().requestHeaders);
			done();
		});
		this.requests[0].respond(200);
	});

	it('should load response content from cache', function(done) {
		var screen = new RequestScreen();
		var cache = {};
		screen.addCache(cache);
		screen.load('/url').then(function(cachedContent) {
			assert.strictEqual(cache, cachedContent);
			done();
		});
	});

	it('should not load response content from cache for post requests', function(done) {
		var screen = new RequestScreen();
		var cache = {};
		screen.setHttpMethod(RequestScreen.POST);
		screen.load('/url').then(() => {
			screen.load('/url').then((cachedContent) => {
				assert.notStrictEqual(cache, cachedContent);
				done();
			});
			this.requests[1].respond(200);
		});
		this.requests[0].respond(200);
	});

	it('should cancel load request to an url', function(done) {
		var self = this;
		var screen = new RequestScreen();
		screen.load('/url')
			.then(function() {
				assert.fail();
			})
			.catch(function() {
				assert.ok(self.requests[0].aborted);
				done();
			})
			.cancel();
	});

	it('should form navigate force post method and request body wrapped in FormData', function(done) {
		globals.capturedFormElement = globals.document.createElement('form');
		var screen = new RequestScreen();
		screen.load('/url').then(function() {
			assert.strictEqual(RequestScreen.POST, screen.getRequest().method);
			assert.ok(screen.getRequest().requestBody instanceof FormData);
			globals.capturedFormElement = null;
			done();
		});
		this.requests[0].respond(200);
	});

});