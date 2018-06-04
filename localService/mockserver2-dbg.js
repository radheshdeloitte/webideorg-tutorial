/*
 * Copyright (C) 2009-2017 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/ui/core/util/MockServer"
], function(MockServer) {
	"use strict";
	var oMockServer,
		_sAppModulePath = "s2p/mm/im/goodsreceipt/purchaseorder/",
		_sJsonFilesModulePath = _sAppModulePath + "localService/mockdata";

	return {

		/**
		 * Initializes the mock server.
		 * You can configure the delay with the URL parameter "serverDelay".
		 * The local mock data in this folder is returned instead of the real data for testing.
		 * @public
		 */
		init: function() {
			var oUriParameters = jQuery.sap.getUriParameters(),
				sJsonFilesUrl = jQuery.sap.getModulePath(_sJsonFilesModulePath),
				sEntity = "MaterialStorLocHelps",
				sErrorParam = oUriParameters.get("errorType"),
				iErrorCode = sErrorParam === "badRequest" ? 400 : 500,
				sMetadataUrl = jQuery.sap.getModulePath(_sAppModulePath) + "/localService/metadata2.xml",
				// ensure there is a trailing slash
				sMockServerUrl = "/sap/opu/odata/sap/CV_ATTACHMENT_SRV/";

			oMockServer = new MockServer({
				rootUri: sMockServerUrl
			});

			// configure mock server with a delay of 1s
			MockServer.config({
				autoRespond: true,
				autoRespondAfter: (oUriParameters.get("serverDelay") || 1000)
			});

			// load local mock data
			oMockServer.simulate(sMetadataUrl, {
				sMockdataBaseUrl: sJsonFilesUrl,
				bGenerateMissingMockData: true
			});

			var aRequests = oMockServer.getRequests(),
				fnResponse = function(iErrCode, sMessage, aRequest) {
					aRequest.response = function(oXhr) {
						oXhr.respond(iErrCode, {
							"Content-Type": "text/plain;charset=utf-8"
						}, sMessage);
					};
				};

			// handling the metadata error test
			if (oUriParameters.get("metadataError")) {
				aRequests.forEach(function(aEntry) {
					if (aEntry.path.toString().indexOf("$metadata") > -1) {
						fnResponse(500, "metadata Error", aEntry);
					}
				});
			}

			// Handling request errors
			if (sErrorParam) {
				aRequests.forEach(function(aEntry) {
					if (aEntry.path.toString().indexOf(sEntity) > -1) {
						fnResponse(iErrorCode, sErrorParam, aEntry);
					}
				});
			}
			
			aRequests.push({
				method: "GET",
				path: new RegExp("GetArchiveLinkAttachments(.*)"),
				response: function(oXhr, sUrlParams) {
					jQuery.sap.log.debug("Incoming request for GetArchiveLinkAttachments");
				

					var oResponse = {
						data: {"d":{"results":[]} },
						headers: {
							"Content-Type": "application/json;charset=utf-8",
							"DataServiceVersion": "1.0"
						},
						status: "204",
						statusText: "No Content"
					};
					oXhr.respond(oResponse.status, oResponse.headers, JSON.stringify({
						d: oResponse.data
					}));

					return true;
				}
			});
			aRequests.push({
				method: "GET",
				path: new RegExp("GetAllOriginals(.*)"),
				response: function(oXhr, sUrlParams) {
					jQuery.sap.log.debug("Incoming request for GetAllOriginals");
				

					var oResponse = {
						data: {"d":{"results":[]} },
						headers: {
							"Content-Type": "application/json;charset=utf-8",
							"DataServiceVersion": "1.0"
						},
						status: "204",
						statusText: "No Content"
					};
					oXhr.respond(oResponse.status, oResponse.headers, JSON.stringify({
						d: oResponse.data
					}));

					return true;
				}
			});
			
			
			
			
			oMockServer.setRequests(aRequests);
			
			
			
			oMockServer.start();

			jQuery.sap.log.info("Running the app with mock data of Attachment Service");
		},

		/**
		 * @public returns the mockserver of the app, should be used in integration tests
		 * @returns {sap.ui.core.util.MockServer} the mockserver instance
		 */
		getMockServer: function() {
			return oMockServer;
		}
	};

});