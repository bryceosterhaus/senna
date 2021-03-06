'use strict';

import array from 'bower:metal/src/array/array';
import async from 'bower:metal/src/async/async';
import core from 'bower:metal/src/core';
import dom from 'bower:metal/src/dom/dom';
import EventEmitter from 'bower:metal/src/events/EventEmitter';
import EventHandler from 'bower:metal/src/events/EventHandler';
import CancellablePromise from 'bower:metal-promise/src/promise/Promise';
import globals from '../globals/globals';
import Route from '../route/Route';
import Screen from '../screen/Screen';
import Surface from '../surface/Surface';

class App extends EventEmitter {

	/**
	 * App class that handle routes and screens lifecycle.
	 * @constructor
	 * @extends {EventEmitter}
	 */
	constructor() {
		super();

		/**
		 * Holds the active screen.
		 * @type {?Screen}
		 * @protected
		 */
		this.activeScreen = null;

		/**
		 * Holds the active path containing the query parameters.
		 * @type {?string}
		 * @protected
		 */
		this.activePath = null;

		/**
		 * Holds link base path.
		 * @type {!string}
		 * @default ''
		 * @protected
		 */
		this.basePath = '';

		/**
		 * Captures scroll position from scroll event.
		 * @type {!boolean}
		 * @default true
		 * @protected
		 */
		this.captureScrollPositionFromScrollEvent = true;

		/**
		 * Holds the default page title.
		 * @type {string}
		 * @default null
		 * @protected
		 */
		this.defaultTitle = '';

		/**
		 * Holds the form selector to define forms that are routed.
		 * @type {!string}
		 * @default form[enctype="multipart/form-data"]:not([data-senna-off])
		 * @protected
		 */
		this.formSelector = 'form[enctype="multipart/form-data"]:not([data-senna-off])';

		/**
		 * Holds the link selector to define links that are routed.
		 * @type {!string}
		 * @default a:not([data-senna-off])
		 * @protected
		 */
		this.linkSelector = 'a:not([data-senna-off])';

		/**
		 * Holds the loading css class.
		 * @type {!string}
		 * @default senna-loading
		 * @protected
		 */
		this.loadingCssClass = 'senna-loading';

		/**
		 * Using the History API to manage your URLs is awesome and, as it happens,
		 * a crucial feature of good web apps. One of its downsides, however, is
		 * that scroll positions are stored and then, more importantly, restored
		 * whenever you traverse the history. This often means unsightly jumps as
		 * the scroll position changes automatically, and especially so if your app
		 * does transitions, or changes the contents of the page in any way.
		 * Ultimately this leads to an horrible user experience. The good news is,
		 * however, that there’s a potential fix: history.scrollRestoration.
		 * https://developers.google.com/web/updates/2015/09/history-api-scroll-restoration
		 * @type {boolean}
		 * @protected
		 */
		this.nativeScrollRestorationSupported = ('scrollRestoration' in globals.window.history);

		/**
		 * Holds a deferred withe the current navigation.
		 * @type {?CancellablePromise}
		 * @default null
		 * @protected
		 */
		this.pendingNavigate = null;

		/**
		 * Holds the window horizontal scroll position when the navigation using
		 * back or forward happens to be restored after the surfaces are updated.
		 * @type {!Number}
		 * @default 0
		 * @protected
		 */
		this.popstateScrollLeft = 0;

		/**
		 * Holds the window vertical scroll position when the navigation using
		 * back or forward happens to be restored after the surfaces are updated.
		 * @type {!Number}
		 * @default 0
		 * @protected
		 */
		this.popstateScrollTop = 0;

		/**
		 * Holds the screen routes configuration.
		 * @type {?Array}
		 * @default []
		 * @protected
		 */
		this.routes = [];

		/**
		 * Maps the screen instances by the url containing the parameters.
		 * @type {?Object}
		 * @default {}
		 * @protected
		 */
		this.screens = {};

		/**
		 * Holds the scroll event handle.
		 * @type {Object}
		 * @default null
		 * @protected
		 */
		this.scrollHandle = null;

		/**
		 * When set to true the first erroneous popstate fired on page load will be
		 * ignored, only if <code>globals.window.history.state</code> is also
		 * <code>null</code>.
		 * @type {boolean}
		 * @default false
		 * @protected
		 */
		this.skipLoadPopstate = false;

		/**
		 * Maps that index the surfaces instances by the surface id.
		 * @type {?Object}
		 * @default {}
		 * @protected
		 */
		this.surfaces = {};

		/**
		 * When set to true, moves the scroll position after popstate, or to the
		 * top of the viewport for new navigation. If false, the browser will
		 * take care of scroll restoration.
		 * @type {!boolean}
		 * @default true
		 * @protected
		 */
		this.updateScrollPosition = true;

		this.appEventHandlers_ = new EventHandler();

		this.appEventHandlers_.add(
			dom.on(globals.window, 'scroll', this.onScroll_.bind(this)),
			dom.on(globals.window, 'load', this.onLoad_.bind(this)),
			dom.on(globals.window, 'popstate', this.onPopstate_.bind(this))
		);

		this.on('startNavigate', this.onStartNavigate_);
		this.on('beforeNavigate', this.onBeforeNavigate_, true);

		this.setLinkSelector(this.linkSelector);
		this.setFormSelector(this.formSelector);
	}

	/**
	 * Adds one or more screens to the application.
	 *
	 * Example:
	 *
	 * <code>
	 *   app.addRoutes({ path: '/foo', handler: FooScreen });
	 *   or
	 *   app.addRoutes([{ path: '/foo', handler: function(route) { return new FooScreen(); } }]);
	 * </code>
	 *
	 * @param {Object} or {Array} routes Single object or an array of object.
	 *     Each object should contain <code>path</code> and <code>screen</code>.
	 *     The <code>path</code> should be a string or a regex that maps the
	 *     navigation route to a screen class definition (not an instance), e.g:
	 *         <code>{ path: "/home:param1", handler: MyScreen }</code>
	 *         <code>{ path: /foo.+/, handler: MyScreen }</code>
	 * @chainable
	 */
	addRoutes(routes) {
		if (!Array.isArray(routes)) {
			routes = [routes];
		}
		routes.forEach((route) => {
			if (!(route instanceof Route)) {
				route = new Route(route.path, route.handler);
			}
			this.routes.push(route);
		});
		return this;
	}

	/**
	 * Adds one or more surfaces to the application.
	 * @param {Surface|String|Array.<Surface|String>} surfaces
	 *     Surface element id or surface instance. You can also pass an Array
	 *     whichcontains surface instances or id. In case of ID, these should be
	 *     the id of surface element.
	 * @chainable
	 */
	addSurfaces(surfaces) {
		if (!Array.isArray(surfaces)) {
			surfaces = [surfaces];
		}
		surfaces.forEach((surface) => {
			if (core.isString(surface)) {
				surface = new Surface(surface);
			}
			this.surfaces[surface.getId()] = surface;
		});
		return this;
	}

	/**
	 * Clear screens cache.
	 * @chainable
	 */
	clearScreensCache() {
		Object.keys(this.screens).forEach((path) => {
			if (path !== this.activePath) {
				this.removeScreen_(path, this.screens[path]);
			}
		});
	}

	/**
	 * Retrieves or create a screen instance to a path.
	 * @param {!string} path Path containing the querystring part.
	 * @return {Screen}
	 */
	createScreenInstance(path, route) {
		var cachedScreen;
		if (path === this.activePath) {
			// When simulating page refresh the request lifecycle must be respected,
			// hence create a new screen instance for the same path.
			console.log('Already at destination, refresh navigation');
			cachedScreen = this.screens[path];
			delete this.screens[path];
		}
		/* jshint newcap: false */
		var screen = this.screens[path];
		if (!screen) {
			console.log('Create screen for [' + path + ']');
			var handler = route.getHandler();
			if (handler === Screen || Screen.isImplementedBy(handler.prototype)) {
				screen = new handler();
			} else {
				screen = handler(route) || new Screen();
			}
			if (cachedScreen) {
				screen.addCache(cachedScreen.getCache());
			}
		}
		return screen;
	}

	/**
	 * @inheritDoc
	 */
	disposeInternal() {
		if (this.activeScreen) {
			this.removeScreen_(this.activePath, this.activeScreen);
		}
		this.clearScreensCache();
		this.formEventHandler_.removeListener();
		this.linkEventHandler_.removeListener();
		this.appEventHandlers_.removeAllListeners();
		super.disposeInternal();
	}

	/**
	 * Dispatches to the first route handler that matches the current path, if
	 * any.
	 * @return {CancellablePromise} Returns a pending request cancellable promise.
	 */
	dispatch() {
		var currentPath = globals.window.location.pathname + globals.window.location.search + globals.window.location.hash;
		return this.navigate(currentPath, true);
	}

	/**
	 * Starts navigation to a path.
	 * @param {!string} path Path containing the querystring part.
	 * @param {boolean=} opt_replaceHistory Replaces browser history.
	 * @return {CancellablePromise} Returns a pending request cancellable promise.
	 */
	doNavigate_(path, opt_replaceHistory) {
		if (this.activeScreen && this.activeScreen.beforeDeactivate()) {
			this.pendingNavigate = CancellablePromise.reject(new CancellablePromise.CancellationError('Cancelled by active screen'));
			return this.pendingNavigate;
		}

		var route = this.findRoute(path);
		if (!route) {
			this.pendingNavigate = CancellablePromise.reject(new CancellablePromise.CancellationError('No route for ' + path));
			return this.pendingNavigate;
		}

		console.log('Navigate to [' + path + ']');

		var nextScreen = this.createScreenInstance(path, route);

		return nextScreen.load(path)
			.then(() => {
				if (this.activeScreen) {
					this.activeScreen.deactivate();
				}
				this.prepareNavigateHistory_(path, nextScreen, opt_replaceHistory);
				this.prepareNavigateSurfaces_(nextScreen, this.surfaces);
				return nextScreen.flip(this.surfaces);
			})
			.then(() => this.syncScrollPositionSyncThenAsync_())
			.then(() => this.finalizeNavigate_(path, nextScreen))
			.catch((reason) => {
				this.handleNavigateError_(path, nextScreen, reason);
				throw reason;
			});
	}

	/**
	 * Finalizes a screen navigation.
	 * @param {!string} path Path containing the querystring part.
	 * @param {!Screen} nextScreen
	 * @protected
	 */
	finalizeNavigate_(path, nextScreen) {
		nextScreen.activate();

		if (this.activeScreen && !this.activeScreen.isCacheable()) {
			this.removeScreen_(this.activePath, this.activeScreen);
		}

		this.activePath = path;
		this.activeScreen = nextScreen;
		this.screens[path] = nextScreen;
		globals.capturedFormElement = null;
		console.log('Navigation done');
	}

	/**
	 * Finds a route for the test path. Returns true if matches has a route,
	 * otherwise returns null.
	 * @param {!string} path Path containing the querystring part.
	 * @return {?Object} Route handler if match any or <code>null</code> if the
	 *     path is the same as the current url and the path contains a fragment.
	 */
	findRoute(path) {
		// Prevents navigation if it's a hash change on the same url.
		if ((path.lastIndexOf('#') > -1) && this.isPathCurrentBrowserPath(path)) {
			return null;
		}

		path = this.maybeRemovePathHashbang(path).substr(this.basePath.length);

		for (var i = 0; i < this.routes.length; i++) {
			var route = this.routes[i];
			if (route.matchesPath(path)) {
				return route;
			}
		}

		return null;
	}

	/**
	 * Gets link base path.
	 * @return {!string}
	 */
	getBasePath() {
		return this.basePath;
	}

	/**
	 * Gets the default page title.
	 * @return {string} defaultTitle
	 */
	getDefaultTitle() {
		return this.defaultTitle;
	}

	/**
	 * Gets the form selector.
	 * @return {!string}
	 */
	getFormSelector() {
		return this.formSelector;
	}

	/**
	 * Gets the link selector.
	 * @return {!string}
	 */
	getLinkSelector() {
		return this.linkSelector;
	}

	/**
	 * Gets the loading css class.
	 * @return {!string}
	 */
	getLoadingCssClass() {
		return this.loadingCssClass;
	}

	/**
	 * Gets the update scroll position value.
	 * @return {boolean}
	 */
	getUpdateScrollPosition() {
		return this.updateScrollPosition;
	}

	/**
	 * Handle navigation error.
	 * @param {!string} path Path containing the querystring part.
	 * @param {!Screen} nextScreen
	 * @param {!Error} error
	 * @protected
	 */
	handleNavigateError_(path, nextScreen, err) {
		console.log('Navigation error for [' + nextScreen + '] (' + err + ')');
		this.removeScreen_(path, nextScreen);
	}

	/**
	 * Checks if app has routes.
	 * @return {boolean}
	 */
	hasRoutes() {
		return this.routes.length > 0;
	}

	/**
	 * Checks if path is the same as the browser current path.
	 * @param  {!string} path
	 * @return {boolean}
	 */
	isPathCurrentBrowserPath(path) {
		if (path) {
			return this.maybeRemovePathHashbang(path) === globals.window.location.pathname + globals.window.location.search;
		}
		return false;
	}

	/**
	 * Returns true if HTML5 History api is supported.
	 * @return {boolean}
	 */
	isHtml5HistorySupported() {
		return globals.window.history && globals.window.history.pushState;
	}

	/**
	 * Tests if hostname is an offsite link.
	 * @param {!string} hostname Link hostname to compare with
	 *     <code>globals.window.location.hostname</code>.
	 * @return {boolean}
	 * @protected
	 */
	isLinkSameOrigin_(hostname) {
		return hostname === globals.window.location.hostname;
	}

	/**
	 * Tests if link element has the same app's base path.
	 * @param {!string} path Link path containing the querystring part.
	 * @return {boolean}
	 * @protected
	 */
	isSameBasePath_(path) {
		return path.indexOf(this.basePath) === 0;
	}

	/**
	 * Lock the document scroll in order to avoid the browser native back and
	 * forward navigation to change the scroll position. In the end of
	 * navigation lifecycle scroll is repositioned.
	 * @protected
	 */
	lockHistoryScrollPosition_() {
		var state = globals.window.history.state;
		if (!state) {
			return;
		}
		// Browsers are inconsistent when re-positioning the scroll history on
		// popstate. At some browsers, history scroll happens before popstate, then
		// lock the scroll on the last known position as soon as possible after the
		// current JS execution context and capture the current value. Some others,
		// history scroll happens after popstate, in this case, we bind an once
		// scroll event to lock the las known position. Lastly, the previous two
		// behaviors can happen even on the same browser, hence the race will decide
		// the winner.
		var winner = false;
		var switchScrollPositionRace = function() {
			globals.document.removeEventListener('scroll', switchScrollPositionRace, false);
			if (!winner) {
				globals.window.scrollTo(state.scrollLeft, state.scrollTop);
				winner = true;
			}
		};
		async.nextTick(switchScrollPositionRace);
		globals.document.addEventListener('scroll', switchScrollPositionRace, false);
	}

	/**
	 * If supported by the browser, disables native scroll restoration and
	 * stores current value.
	 */
	maybeDisableNativeScrollRestoration() {
		if (this.nativeScrollRestorationSupported) {
			this.nativeScrollRestoration_ = globals.window.history.scrollRestoration;
			globals.window.history.scrollRestoration = 'manual';
		}
	}

	/**
	 * Maybe navigate to link element.
	 * @param {Element} link Link element that holds navigation information.
	 * @param {Event} event Dom event that initiated the navigation.
	 */
	maybeNavigateToLinkElement_(link, event) {
		var path = link.pathname + link.search + link.hash;

		if (!this.isLinkSameOrigin_(link.hostname)) {
			console.log('Offsite link clicked');
			return;
		}
		if (!this.isSameBasePath_(path)) {
			console.log('Link clicked outside app\'s base path');
			return;
		}
		if (!this.findRoute(path)) {
			console.log('No route for ' + path);
			return;
		}

		var navigateFailed = false;
		try {
			this.navigate(path);
		} catch (err) {
			// Do not prevent link navigation in case some synchronous error occurs
			navigateFailed = true;
		}

		if (!navigateFailed) {
			event.preventDefault();
		}
	}

	/**
	 * Checks if path has hashbang, if so, removes it.
	 * @param  {!string} path
	 * @return {string} Path without hashbang.
	 */
	maybeRemovePathHashbang(path) {
		var hashIndex = path.lastIndexOf('#');
		if (hashIndex > -1) {
			path = path.substr(0, hashIndex);
		}
		return path;
	}

	/**
	 * Maybe reposition scroll to hashed anchor.
	 */
	maybeRepositionScrollToHashedAnchor() {
		var hash = globals.window.location.hash;
		if (hash) {
			var anchorElement = globals.document.getElementById(hash.substring(1));
			if (anchorElement) {
				globals.window.scrollTo(anchorElement.offsetLeft, anchorElement.offsetTop);
			}
		}
	}

	/**
	 * If supported by the browser, restores native scroll restoration to the
	 * value captured by `maybeDisableNativeScrollRestoration`.
	 */
	maybeRestoreNativeScrollRestoration() {
		if (this.nativeScrollRestorationSupported && this.nativeScrollRestoration_) {
			globals.window.history.scrollRestoration = this.nativeScrollRestoration_;
		}
	}

	/**
	 * Navigates to the specified path if there is a route handler that matches.
	 * @param {!string} path Path to navigate containing the base path.
	 * @param {boolean=} opt_replaceHistory Replaces browser history.
	 * @return {CancellablePromise} Returns a pending request cancellable promise.
	 */
	navigate(path, opt_replaceHistory) {
		if (!this.isHtml5HistorySupported()) {
			throw new Error('HTML5 History is not supported. Senna will not intercept navigation.');
		}

		// When reloading the same path do replaceState instead of pushState to
		// avoid polluting history with states with the same path.
		if (path === this.activePath) {
			opt_replaceHistory = true;
		}

		this.emit('beforeNavigate', {
			path: path,
			replaceHistory: !!opt_replaceHistory
		});

		return this.pendingNavigate;
	}

	/**
	 * Befores navigation to a path.
	 * @param {!Event} event Event facade containing <code>path</code> and
	 *     <code>replaceHistory</code>.
	 * @protected
	 */
	onBeforeNavigate_(event) {
		this.emit('startNavigate', {
			path: event.path,
			replaceHistory: event.replaceHistory
		});
	}

	/**
	 * Intercepts document clicks and test link elements in order to decide
	 * whether Surface app can navigate.
	 * @param {!Event} event Event facade
	 * @protected
	 */
	onDocClickDelegate_(event) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.button) {
			console.log('Navigate aborted, invalid mouse button or modifier key pressed.');
			return;
		}
		this.maybeNavigateToLinkElement_(event.delegateTarget, event);
	}

	/**
	 * Intercepts document form submits and test action path in order to decide
	 * whether Surface app can navigate.
	 * @param {!Event} event Event facade
	 * @protected
	 */
	onDocSubmitDelegate_(event) {
		var form = event.delegateTarget;
		var link = globals.document.createElement('a');
		link.href = form.action;
		if (form.method === 'get') {
			console.log('GET method not supported');
			return;
		}
		globals.capturedFormElement = form;
		this.maybeNavigateToLinkElement_(link, event);
	}

	/**
	 * Listens to the window's load event in order to avoid issues with some browsers
	 * that trigger popstate calls on the first load. For more information see
	 * http://stackoverflow.com/questions/6421769/popstate-on-pages-load-in-chrome.
	 * @protected
	 */
	onLoad_() {
		this.skipLoadPopstate = true;
		setTimeout(() => {
			// The timeout ensures that popstate events will be unblocked right
			// after the load event occured, but not in the same event-loop cycle.
			this.skipLoadPopstate = false;
		}, 0);
		// Try to reposition scroll to the hashed anchor when page loads.
		this.maybeRepositionScrollToHashedAnchor();
	}

	/**
	 * Handles browser history changes and fires app's navigation if the state
	 * belows to us. If we detect a popstate and the state is <code>null</code>,
	 * assume it is navigating to an external page or to a page we don't have
	 * route, then <code>globals.window.location.reload()</code> is invoked in order to
	 * reload the content to the current url.
	 * @param {!Event} event Event facade
	 * @protected
	 */
	onPopstate_(event) {
		if (this.skipLoadPopstate) {
			return;
		}

		var state = event.state;

		if (!state) {
			if (globals.window.location.hash) {
				// If senna is on an active path and a hash popstate happens to
				// a different url, reload the browser. This behavior doesn't
				// require senna to route hashed links and is closer to native
				// browser behavior.
				if (this.activePath && !this.isPathCurrentBrowserPath(this.activePath)) {
					this.reloadPage();
				}
				// Always try to reposition scroll to the hashed anchor when
				// hash popstate happens.
				this.maybeRepositionScrollToHashedAnchor();
			} else {
				this.reloadPage();
			}
			return;
		}

		if (state.senna) {
			console.log('History navigation to [' + state.path + ']');
			this.popstateScrollTop = state.scrollTop;
			this.popstateScrollLeft = state.scrollLeft;
			if (!this.nativeScrollRestorationSupported) {
				this.lockHistoryScrollPosition_();
			}
			this.navigate(state.path, true);
		}
	}

	/**
	 * Listens document scroll changes in order to capture the possible lock
	 * scroll position for history scrolling.
	 * @protected
	 */
	onScroll_() {
		if (this.captureScrollPositionFromScrollEvent) {
			this.saveHistoryCurrentPageScrollPosition_();
		}
	}

	/**
	 * Starts navigation to a path.
	 * @param {!Event} event Event facade containing <code>path</code> and
	 *     <code>replaceHistory</code>.
	 * @protected
	 */
	onStartNavigate_(event) {
		this.maybeDisableNativeScrollRestoration();
		this.captureScrollPositionFromScrollEvent = false;

		var endPayload = {};

		if (globals.capturedFormElement) {
			event.form = globals.capturedFormElement;
			endPayload.form = globals.capturedFormElement;
		}

		var documentElement = globals.document.documentElement;

		dom.addClasses(documentElement, this.loadingCssClass);

		this.stopPendingNavigate_();

		this.pendingNavigate = this.doNavigate_(event.path, event.replaceHistory)
			.catch((err) => {
				endPayload.error = err;
				throw err;
			})
			.thenAlways(() => {
				endPayload.path = event.path;
				dom.removeClasses(documentElement, this.loadingCssClass);
				this.maybeRestoreNativeScrollRestoration();
				this.captureScrollPositionFromScrollEvent = true;
				this.emit('endNavigate', endPayload);
			});
	}

	/**
	 * Prefetches the specified path if there is a route handler that matches.
	 * @param {!string} path Path to navigate containing the base path.
	 * @return {CancellablePromise} Returns a pending request cancellable promise.
	 */
	prefetch(path) {
		var route = this.findRoute(path);
		if (!route) {
			return CancellablePromise.reject(new CancellablePromise.CancellationError('No route for ' + path));
		}

		console.log('Prefetching [' + path + ']');

		var nextScreen = this.createScreenInstance(path, route);

		return nextScreen.load(path)
			.then(() => this.screens[path] = nextScreen)
			.catch((reason) => {
				this.handleNavigateError_(path, nextScreen, reason);
				throw reason;
			});
	}

	/**
	 * Prepares screen flip. Updates history state and surfaces content.
	 * @param {!string} path Path containing the querystring part.
	 * @param {!Screen} nextScreen
	 * @param {boolean=} opt_replaceHistory Replaces browser history.
	 */
	prepareNavigateHistory_(path, nextScreen, opt_replaceHistory) {
		var title = nextScreen.getTitle();
		if (!core.isString(title)) {
			title = this.getDefaultTitle();
		}
		var historyState = {
			form: core.isDefAndNotNull(globals.capturedFormElement),
			navigatePath: path,
			path: nextScreen.beforeUpdateHistoryPath(path),
			senna: true,
			scrollTop: 0,
			scrollLeft: 0
		};
		if (opt_replaceHistory) {
			historyState.scrollTop = this.popstateScrollTop;
			historyState.scrollLeft = this.popstateScrollLeft;
		}
		this.updateHistory_(title, historyState.path, nextScreen.beforeUpdateHistoryState(historyState), opt_replaceHistory);
	}

	/**
	 * Prepares screen flip. Updates history state and surfaces content.
	 * @param {!Screen} nextScreen
	 * @param {!object} surfaces Map of surfaces to flip keyed by surface id.
	 */
	prepareNavigateSurfaces_(nextScreen, surfaces) {
		Object.keys(surfaces).forEach((id) => {
			var surfaceContent = nextScreen.getSurfaceContent(id);
			surfaces[id].addContent(nextScreen.getId(), surfaceContent, true);
			console.log('Screen [' + nextScreen.getId() + '] add content to surface ' +
				'[' + surfaces[id] + '] [' + (core.isDefAndNotNull(surfaceContent) ? '...' : 'empty') + ']');
		});
	}

	/**
	 * Reloads the page by performing `window.location.reload()`.
	 */
	reloadPage() {
		globals.window.location.reload();
	}

	/**
	 * Removes route instance from app routes.
	 * @param {Route} route
	 * @return {boolean} True if an element was removed.
	 */
	removeRoute(route) {
		return array.remove(this.routes, route);
	}

	/**
	 * Removes a screen.
	 * @param {!string} path Path containing the querystring part.
	 * @param {!Screen} screen
	 * @protected
	 */
	removeScreen_(path, screen) {
		Object.keys(this.surfaces).forEach((surfaceId) => this.surfaces[surfaceId].remove(screen.getId()));
		screen.dispose();
		delete this.screens[path];
	}

	/**
	 * Saves scroll position from page offset into history state.
	 */
	saveHistoryCurrentPageScrollPosition_() {
		var state = globals.window.history.state;
		if (state && state.senna) {
			state.scrollTop = globals.window.pageYOffset;
			state.scrollLeft = globals.window.pageXOffset;
			globals.window.history.replaceState(state, null, null);
		}
	}

	/**
	 * Sets link base path.
	 * @param {!string} path
	 */
	setBasePath(basePath) {
		this.basePath = basePath;
	}

	/**
	 * Sets the default page title.
	 * @param {string} defaultTitle
	 */
	setDefaultTitle(defaultTitle) {
		this.defaultTitle = defaultTitle;
	}

	/**
	 * Sets the form selector.
	 * @param {!string} formSelector
	 */
	setFormSelector(formSelector) {
		this.formSelector = formSelector;
		if (this.formEventHandler_) {
			this.formEventHandler_.removeListener();
		}
		this.formEventHandler_ = dom.delegate(document, 'submit', this.formSelector, this.onDocSubmitDelegate_.bind(this));
	}

	/**
	 * Sets the link selector.
	 * @param {!string} linkSelector
	 */
	setLinkSelector(linkSelector) {
		this.linkSelector = linkSelector;
		if (this.linkEventHandler_) {
			this.linkEventHandler_.removeListener();
		}
		this.linkEventHandler_ = dom.delegate(document, 'click', this.linkSelector, this.onDocClickDelegate_.bind(this));
	}

	/**
	 * Sets the loading css class.
	 * @param {!string} loadingCssClass
	 */
	setLoadingCssClass(loadingCssClass) {
		this.loadingCssClass = loadingCssClass;
	}

	/**
	 * Sets the update scroll position value.
	 * @param {boolean} updateScrollPosition
	 */
	setUpdateScrollPosition(updateScrollPosition) {
		this.updateScrollPosition = updateScrollPosition;
	}

	/**
	 * Cancels pending navigate with <code>Cancel pending navigation</code> error.
	 * @protected
	 */
	stopPendingNavigate_() {
		if (this.pendingNavigate) {
			this.pendingNavigate.cancel('Cancel pending navigation');
			this.pendingNavigate = null;
		}
	}

	/**
	 * Sync document scroll position twice, the first one synchronous and then
	 * one inside <code>async.nextTick</code>. Relevant to browsers that fires
	 * scroll restoration asynchronously after popstate.
	 * @protected
	 * @return {?CancellablePromise=}
	 */
	syncScrollPositionSyncThenAsync_() {
		var state = globals.window.history.state;
		if (!state) {
			return;
		}

		var scrollTop = state.scrollTop;
		var scrollLeft = state.scrollLeft;

		var sync = () => {
			if (this.updateScrollPosition) {
				globals.window.scrollTo(scrollLeft, scrollTop);
			}
		};

		return new CancellablePromise((resolve) => sync() & async.nextTick(() => sync() & resolve()));
	}

	/**
	 * Updates or replace browser history.
	 * @param {?string} title Document title.
	 * @param {!string} path Path containing the querystring part.
	 * @param {!object} state
	 * @param {boolean=} opt_replaceHistory Replaces browser history.
	 * @protected
	 */
	updateHistory_(title, path, state, opt_replaceHistory) {
		if (opt_replaceHistory) {
			globals.window.history.replaceState(state, title, path);
		} else {
			globals.window.history.pushState(state, title, path);
		}
		globals.document.title = title;
	}

}

export default App;