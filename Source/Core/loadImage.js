define([
        '../ThirdParty/when',
        './Check',
        './defaultValue',
        './defined',
        './isBlobUri',
        './isCrossOriginUrl',
        './isDataUri',
        './Request',
        './RequestScheduler',
        './RequestState',
        './Resource',
        './TrustedServers'
    ], function(
        when,
        Check,
        defaultValue,
        defined,
        isBlobUri,
        isCrossOriginUrl,
        isDataUri,
        Request,
        RequestScheduler,
        RequestState,
        Resource,
        TrustedServers) {
    'use strict';

    /**
     * Asynchronously loads the given image URL.  Returns a promise that will resolve to
     * an {@link Image} once loaded, or reject if the image failed to load.
     *
     * @exports loadImage
     *
     * @param {Resource|String} urlOrResource The source URL of the image.
     * @param {Boolean} [allowCrossOrigin=true] Whether to request the image using Cross-Origin
     *        Resource Sharing (CORS).  CORS is only actually used if the image URL is actually cross-origin.
     *        Data URIs are never requested using CORS.
     * @param {Request} [request] The request object. Intended for internal use only.
     * @returns {Promise.<Image>|undefined} a promise that will resolve to the requested data when loaded. Returns undefined if <code>request.throttle</code> is true and the request does not have high enough priority.
     *
     *
     * @example
     * // load a single image asynchronously
     * Cesium.loadImage('some/image/url.png').then(function(image) {
     *     // use the loaded image
     * }).otherwise(function(error) {
     *     // an error occurred
     * });
     *
     * // load several images in parallel
     * when.all([loadImage('image1.png'), loadImage('image2.png')]).then(function(images) {
     *     // images is an array containing all the loaded images
     * });
     *
     * @see {@link http://www.w3.org/TR/cors/|Cross-Origin Resource Sharing}
     * @see {@link http://wiki.commonjs.org/wiki/Promises/A|CommonJS Promises/A}
     */
    function loadImage(urlOrResource, allowCrossOrigin, request) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('urlOrResource', urlOrResource);
        //>>includeEnd('debug');

        urlOrResource = defined(urlOrResource.clone) ? urlOrResource.clone() : urlOrResource;
        var resource = Resource.createIfNeeded(urlOrResource, {
            request: request
        });

        resource.request = defaultValue(resource.request, new Request());

        return makeRequest(resource, defaultValue(allowCrossOrigin, true));
    }

    function makeRequest(resource, allowCrossOrigin) {
        var url = resource.url;
        var request = resource.request;
        request.url = url;
        request.requestFunction = function() {
            var crossOrigin;

            // data URIs can't have allowCrossOrigin set.
            if (isDataUri(url) || isBlobUri(url)) {
                crossOrigin = false;
            } else {
                crossOrigin = isCrossOriginUrl(url);
            }

            var deferred = when.defer();

            loadImage.createImage(url, crossOrigin && allowCrossOrigin, deferred);

            return deferred.promise;
        };

        var promise = RequestScheduler.request(request);
        if (!defined(promise)) {
            return;
        }

        return promise
            .otherwise(function(e) {
                return resource.retryOnError(e)
                    .then(function(retry) {
                        if (retry) {
                            // Reset request so it can try again
                            request.state = RequestState.UNISSUED;
                            request.deferred = undefined;

                            return makeRequest(resource);
                        }

                        return when.reject(e);
                    });
            });
    }

    // This is broken out into a separate function so that it can be mocked for testing purposes.
    loadImage.createImage = function(url, crossOrigin, deferred) {
        var image = new Image();

        image.onload = function() {
            deferred.resolve(image);
        };

        image.onerror = function(e) {
            deferred.reject(e);
        };

        if (crossOrigin) {
            if (TrustedServers.contains(url)) {
                image.crossOrigin = 'use-credentials';
            } else {
                image.crossOrigin = '';
            }
        }

        image.src = url;
    };

    loadImage.defaultCreateImage = loadImage.createImage;

    return loadImage;
});
