/*
 * Copyright (C) 2009-2017 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"s2p/mm/im/goodsreceipt/purchaseorder/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"s2p/mm/im/goodsreceipt/purchaseorder/model/formatter",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"ui/s2p/mm/im/lib/materialmaster/controller/ValueHelpController",
	"sap/m/MessageToast",
	"sap/ui/generic/app/navigation/service/NavigationHandler"
], function(BaseController, JSONModel, formatter, Filter, FilterOperator, ValueHelp, MessageToast, NavigationHandler) {
	"use strict";

	return BaseController.extend("s2p.mm.im.goodsreceipt.purchaseorder.controller.S1", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the worklist controller is instantiated.
		 * @public
		 */
		onInit: function() {

			var that = this;
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			//both views
			///cross navigation service
			/**
			 * @property {objectl} _oNavigationService reference to generic navigation handler
			 */
			this._oNavigationService = new sap.ui.generic.app.navigation.service.NavigationHandler(this, sap.ui.generic.app.navigation.service
				.ParamHandlingMode
				.URLParamWins);

			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S1") {
				this._toggleBusy(true);
				if (!jQuery.support.touch) { //setting compact on non touch devices
					this.getView().addStyleClass("sapUiSizeCompact");
				} else { //touch device
					this.getView().byId("POInput").setWidth("100%");
					this.getView().byId("idTableSearch").setWidth("40%");
				}

				//init all private properties of the controller: fixed Values for printing, personalisation preset
				this._initController();
				// Congfiguration
				if (sap.ushell) {

					sap.ushell.services.AppConfiguration.addApplicationSettingsButtons([new sap.m.Button({
						text: this.getResourceBundle().getText("SETTINGS_TITLE"),
						press: jQuery.proxy(function() {
							this._showSettingsDialog({});
						}, this)
					})]);

				}

				//setting mode of App
				var sComponentId = sap.ui.core.Component.getOwnerIdFor(this.getView());
				var oComponentData = sap.ui.component(sComponentId).getComponentData();
				//presetting the PONumber by intent based navigation
				/**
				 * @property {String this._SourceOfGR} fixed value to distinguish the different start up options
				 */
				this._SourceOfGR = "";
				this._SourceOfGRIsPurchaseOrder = "PURORD";
				this._SourceOfGRIsInboundDelivery = "INBDELIV";
				if (oComponentData && oComponentData.startupParameters && oComponentData.startupParameters.SourceOfGR) { //Launch Pad
					this._SourceOfGR = oComponentData.startupParameters.SourceOfGR[0];
				} else { // Local 
					this._SourceOfGR = jQuery.sap.getUriParameters().get("SourceOfGR");
				}
				if (this._SourceOfGR === null) {
					this._SourceOfGR = this._SourceOfGRIsPurchaseOrder;
				}

				/**
				 * @property {oData Model} oData link to backend odata model for reading and posting
				 */
				var oData = this.getOwnerComponent().getModel("oData");
				oData.setRefreshAfterChange(false); //Prevent update of model after post
				oData.setDefaultCountMode(sap.ui.model.odata.CountMode.Inline); //Inline count
				this.getView().setModel("oData", oData);
				/**
				 * @property {oData Model} oDataHelp link to backend odata model for help function
				 */
				var oModelHelp = this.getOwnerComponent().getModel("oDataHelp") || {};

				//Dateformat 
				this._oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
					pattern: "dd.MM.yyyy",
					strictParsing: "true",
					UTC: "true"
				});

				// FrontEndModel init     
				var oFrontendModel = new sap.ui.model.json.JSONModel();
				oFrontendModel.setData(this._getInitFrontend());
				/**
				 * @property {JSON Model} oFrontend holding all data from backend and controlling UI functions
				 */
				this.getView().setModel(oFrontendModel, "oFrontend");

				this._ResetStorageLocationBuffer = false; //needed to reset Buffer value help
				this._ResetBatchBuffer = false; //needed to reset Buffer value help
				//back navigation handler

				oRouter.attachRoutePatternMatched(this, this._handleRouteMatched);

				// post dialog fragment
				if (!this._oPostDialog) {
					this._oPostDialog = sap.ui.xmlfragment({
						fragmentName: "s2p.mm.im.goodsreceipt.purchaseorder.view.successPost",
						type: "XML",
						id: "s2p.mm.im.goodsreceipt.purchaseorder.successPost"
					}, this);
					this.getView().addDependent(this._oPostDialog);
				}

				//Personalisation
				var oPersId = {
					container: "s2p.mm.im.goodsreceipt.purchaseorder",
					item: "app"
				};

				/**
				 * @property {objectl} _oPersonalizer reference to personalisation service
				 */
				if (sap.ushell && sap.ushell.Container) { //check if not in local test mode
					this._oPersonalizer = sap.ushell.Container.getService("Personalization").getPersonalizer(oPersId);
				}

				//fixed values in initController

				// check for stored personalisation and try load
				if (this._oPersonalizer) {
					var oPersonalizerReadAttempt = this._oPersonalizer.getPersData().done(function(oPersData) {
						if (oPersData) {
							that._oPersonalizedDataContainer = oPersData;
							if (!that._oPersonalizedDataContainer.PresetDocumentItemTextFromPO) {
								that._oPersonalizedDataContainer.PresetDocumentItemTextFromPO = false;
							}
							if (!that._oPersonalizedDataContainer.SelectPO) {
								that._oPersonalizedDataContainer.SelectPO = true;
							}
							if (!that._oPersonalizedDataContainer.SelectSTO) {
								that._oPersonalizedDataContainer.SelectSTO = false;
							}
							if (!that._oPersonalizedDataContainer.EnableBarcodeScanning) {
								that._oPersonalizedDataContainer.EnableBarcodeScanning = false;
							}
							//set frontend object
							that._setScanButtonVisibility();
							that._setSearchPlaceholderText(); //setting the text
						}
					}).
					fail(function() {
						jQuery.sap.log.error("Reading personalization data failed.");
					});
				}

				//test mode handling & start up parameter
				var sSAPMMIMTestmode = jQuery.sap.getUriParameters().get("sap-mmim-testmode");
				//not found in URL -> try parameters form launchpad
				if (!(sSAPMMIMTestmode && parseInt(sSAPMMIMTestmode) > 0)) {

					if (oComponentData && oComponentData.startupParameters && oComponentData.startupParameters.sap_mmim_testmode) {
						sSAPMMIMTestmode = oComponentData.startupParameters.sap_mmim_testmode[0];
					}
				}

				if (sSAPMMIMTestmode && parseInt(sSAPMMIMTestmode) > 0) {
					//test mode

					var sBaseURI_testmode = "/sap/opu/odata/sap/MMIM_EXTERNALTEST_SRV";
					var oTestModel = new sap.ui.model.odata.ODataModel(sBaseURI_testmode, true);
					var oTestMode = {};
					oTestMode.AverageProcessingDuration = "" + parseInt(sSAPMMIMTestmode);
					oTestMode.CreatedByUser = ""; //default sy-uname

					var sTestUrl = "/TestModeSet";
					oTestModel.create(sTestUrl, oTestMode, null, function(oData, oResponse) {

							//no success required
						}, this._handleOdataError //error Handling
					);

				} //testmode

				// controll arrays in initController

				//checking if Navigationtargets are allowed --> initController

				if (sap.ushell && sap.ushell.Container) { //not during local testing
					var aIntents = new Array();
					var oIntentFactSheet = "#MaterialMovement-displayFactSheet?MaterialDocument=123&MaterialDocumentYear=2016"; //Intent-action
					aIntents.push(oIntentFactSheet); //0
					var oIntentSupplier = "#Supplier-displayFactSheet";
					aIntents.push(oIntentSupplier); //1
					if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
						var oIntentPurchaseOrder = "#PurchaseOrder-displayFactSheet";
						aIntents.push(oIntentPurchaseOrder); //2
					} else {
						var oIntentInboundDeliveryCreate = "#InboundDelivery-displayFactSheet";
						aIntents.push(oIntentInboundDeliveryCreate); //2
					}
					var oIntentMaterialDisplay = "#Material-displayFactSheet";
					aIntents.push(oIntentMaterialDisplay); //3
					var oIntentBatchCreate = "#Batch-create";
					aIntents.push(oIntentBatchCreate); //4

					var oService = sap.ushell.Container.getService("CrossApplicationNavigation");
					var checkedIntents = oService.isNavigationSupported(aIntents).done(function(oCheck) {
						if (oCheck) {
							that._isIntentSupported.GoodsReceiptDisplay = oCheck[0].supported || false;
							that._isIntentSupported.SupplierDisplay = oCheck[1].supported || false;
							that._isIntentSupported.PurchaseOrderDisplay = oCheck[2].supported || false;
							that._isIntentSupported.MaterialDisplay = oCheck[3].supported || false;
							that._isIntentSupported.BatchCreate = oCheck[4].supported || false;
							//set intent in model directly due to asynchronicity when navigation back SupplierDisplayActive
							if (that.getView().getModel("oFrontend")) { //support asynchronous call back
								that.getView().getModel("oFrontend").setProperty("/SupplierDisplayActive", that._isIntentSupported.SupplierDisplay);
								that.getView().getModel("oFrontend").setProperty("/PurchaseOrderDisplayActive", that._isIntentSupported.PurchaseOrderDisplay);
								that.getView().getModel("oFrontend").setProperty("/MaterialDisplayActive", that._isIntentSupported.MaterialDisplay);
								that.getView().getModel("oFrontend").setProperty("/CreateBatchActive", that._isIntentSupported.BatchCreate);
								// need to avoid data loss during async load
								if (that._initialDataLoaded) {
									that._initialDataLoaded.SupplierDisplayActive = that._isIntentSupported.SupplierDisplay;
									that._initialDataLoaded.PurchaseOrderDisplayActive = that._isIntentSupported.PurchaseOrderDisplay;
									that._initialDataLoaded.MaterialDisplayActive = that._isIntentSupported.MaterialDisplay;
									that._initialDataLoaded.CreateBatchActive = that._isIntentSupported.BatchCreate;
								}

							}
						}
					}).
					fail(function() {
						jQuery.sap.log.error("Reading intent data failed.");
					});
				}

				var sPurchaseOrderNumberOrInboundDelivery; //PurchaseOrder or InboundDelivery

				var oPOInput;
				if (oComponentData && oComponentData.startupParameters && oComponentData.startupParameters.PurchaseOrder && (this._SourceOfGR ===
						this._SourceOfGRIsPurchaseOrder)) { //Launch Pad
					sPurchaseOrderNumberOrInboundDelivery = oComponentData.startupParameters.PurchaseOrder[0];
					// } else { // Local 
					// 	sPurchaseOrderNumberOrInboundDelivery = jQuery.sap.getUriParameters().get("PurchaseOrder");
				}

				if (oComponentData && oComponentData.startupParameters && oComponentData.startupParameters.InboundDelivery && (this._SourceOfGR ===
						this._SourceOfGRIsInboundDelivery)) { //Launch Pad
					sPurchaseOrderNumberOrInboundDelivery = oComponentData.startupParameters.InboundDelivery[0];
					// } else { // Local 
					// 	sPurchaseOrderNumberOrInboundDelivery = jQuery.sap.getUriParameters().get("InboundDelivery");
				}

				if (sPurchaseOrderNumberOrInboundDelivery) { //setting the PO&disabling further input
					oPOInput = this.getView().byId("POInput");
					oPOInput.setValue(sPurchaseOrderNumberOrInboundDelivery);
					oPOInput.setEditable(false);
					// oPOInput.fireSuggestionItemSelected({selectedItem:new sap.ui.core.Item( {text:sPurchaseOrderNumber})});
					oPOInput.fireChangeEvent(sPurchaseOrderNumberOrInboundDelivery);
				} else {
					this._oNavigationService.parseNavigation().done(function(oAppData, oStartupParameters, sNavType) {
						if (oAppData && oAppData.customData && oAppData.customData.Ebeln) {
							//Convert Date from internal formal to Output Format
							// var oDateInputFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
							// 	pattern: "yyyy-MM-dd"
							// });
							if (that.getView().byId("POInput")) {
								that.getView().byId("POInput").setValue(oAppData.customData.Ebeln);
							}
							//that.getView().getModel("oFrontend").setProperty("/ReportingDate", oDateOutputFormat.parse(oAppData.customData.ReportingDate));

							that._readPO(oAppData.customData.Ebeln, oAppData.customData);
						}
					});

					this._toggleBusy(false);

				}

				//addressing the lib
				//jQuery.sap.require("ui.s2p.mm.im.lib.materialmaster.controller.ValueHelpController");
				/**
				 * @property {objectl} _oValueHelpController reference to library controller
				 */
				if (ValueHelp) {
					this._oValueHelpController = new ValueHelp();
					this._oValueHelpController.init(oModelHelp);
				}

				//end get fixed values for stock type from backend	
				this._setSearchPlaceholderText();

				/** Extensibility **/
				this._aExtendedFields = [];
				var oMetamodel = oData.getMetaModel().loaded().then(function(oData) {

					var aGR4POItemsProperties = that.getOwnerComponent().getModel("oData").getMetaModel().getODataEntityType(
						"MMIM_GR4PO_DL_SRV.GR4PO_DL_Item").property;
					// for (var i = 0; i < aAllStockTypes.length; i++) {
					// 	bVisible = true;
					for (var j = 0; j < aGR4POItemsProperties.length; j++) {
						if (aGR4POItemsProperties[j]["sap:is-extension-field"]) {
							if (JSON.parse(aGR4POItemsProperties[j]["sap:is-extension-field"]) === true) {
								that._aExtendedFields.push(aGR4POItemsProperties[j]);
							}
						}
					}

					if (that._aExtendedFields.length === 0) { // adapt oDataModel
						that.getOwnerComponent().getModel("oData").setDefaultBindingMode(sap.ui.model.BindingMode.OneWay);
						// that.getOwnerComponent().getModel("oData").setDeferredGroups(["edititems"]);
						// that.getOwnerComponent().getModel("oData").setChangeBatchGroups({
						// 	"GR4PO_DL_Header": {
						// 		batchGroupId: "edititems"
						// 	},
						// 	"GR4PO_DL_Item": {
						// 		batchGroupId: "edititems"
						// 	}
						// });
					}

				});

			} //S1 View

			if (this.getView().sViewName == "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") {

				if (!jQuery.support.touch) { //setting compact on non touch devices
					this.getView().addStyleClass("sapUiSizeCompact");
				}

				//	var oItemModel = this.oApplicationFacade.getApplicationModel("oItem");
				var oItemModel = new sap.ui.model.json.JSONModel();
				// if (oItemModel && oItemModel.oData.SpecialStock == "") {
				// 	var sCurrentLocale = sap.ui.getCore().getConfiguration().getLanguage();
				// 	var oi18nBundle = jQuery.sap.resources({
				// 		url: "i18n/i18n.properties",
				// 		locale: sCurrentLocale
				// 	});
				// 	oItemModel.oData.SpecialStock = oi18nBundle.getText("LABEL_NONE");
				// }
				// associate array for Storage Location Help 	
				//  this._StorageLocationHelp = {};
				//copy properties to second controller instance
				this._oValueHelpController = oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S1", sap.ui.core.mvc.ViewType.XML).getController()
					._oValueHelpController;
				this._aValidStockTypes = oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S1", sap.ui.core.mvc.ViewType.XML).getController()
					._aValidStockTypes;
				this._oNavigationServiceFields = {};
				this._oNavigationServiceFields.aHeaderFields = oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S1", sap.ui.core.mvc.ViewType
						.XML).getController()
					._oNavigationServiceFields.aHeaderFields;
				this._oNavigationServiceFields.aItemFields = oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S1", sap.ui.core.mvc.ViewType
						.XML).getController()
					._oNavigationServiceFields.aItemFields;

				this._aExtendedFields = oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S1", sap.ui.core.mvc.ViewType.XML).getController()
					._aExtendedFields;
				this.getView().setModel(oItemModel, "oItem");

				//originally in handleRouteMatched was moved her in 1.45
				this.getView().setModel(oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S1", sap.ui.core.mvc.ViewType
					.XML).getModel("oFrontend"), "oFrontend");
				//ValueHelp of Reason Code				 
				//this.getView().setModel("oData", this.getOwnerComponent().getModel("oData"));

				this.getView().byId("idGoodsMovementReasonCodeSelect").setModel("oData", this.getOwnerComponent().getModel("oData"));

				if (this._aExtendedFields.length) { //extended fields --> 
					this.getView().getModel("oFrontend").setProperty("/ExtensionSectionVisible", true);
					this.getView().byId("idExtensionForm").setModel(this.getOwnerComponent().getModel("oData"));
					this.getView().byId("idExtensionForm").getModel().setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
					this.getView().byId("idExtensionForm").getModel().setDeferredGroups(["edititems"]);
					this.getView().byId("idExtensionForm").getModel().setChangeBatchGroups({
						"GR4PO_DL_Header": {
							batchGroupId: "edititems"
						},
						"GR4PO_DL_Item": {
							batchGroupId: "edititems"
						}
					});
				}

			} //S2 View

			//both views
			this._oQuantFormat = sap.ui.core.format.NumberFormat.getFloatInstance({
				maxFractionDigits: 3,
				minIntegerDigits: 1,
				maxIntegerDigits: 10,
				groupingEnabled: true
			});
			/**
			 * @property {objectl} _oBatchHelp Map for Batch help requests
			 */
			this._oBatchHelp = {};
			/**
			 * @property {object} _NumberFormatter formatter for numbers
			 */
			this._NumberFormatter = sap.ui.core.format.NumberFormat.getFloatInstance({
				style: "short"
			});

			//Message Manager
			this._oMessagePopover = new sap.m.MessagePopover({
				items: {
					path: "message>/",
					template: new sap.m.MessagePopoverItem({
						longtextUrl: "{message>descriptionUrl}",
						type: "{message>type}",
						markupDescription: true,
						title: "{message>message}"
					})
				}
			});
			this.getView().setModel(sap.ui.getCore().getMessageManager().getMessageModel(), "message");
			this.getView().addDependent(this._oMessagePopover);
			this.getView().getModel("message").attachMessageChange(null, this._onMessageChange, this);

		},

		/**
		 * @function private method for handling oData errors from backend.
		 * @param {object} oError - oData error object
		 * @param {object} oThis - current controller / required due to closesure of oData call
		 */
		//central error functions for oData calls
		_handleOdataError: function(oError, oThis) {
			if (!oThis) {
				oThis = this;
			}

			oThis._toggleBusy(false);
			oThis.getView().getModel("message").fireMessageChange();

		}, //central error functions for oData calls 
		/**
		 *Sets the busy indicator
		 * @private
		 * @param {boolean} bIsBusy state of busy indicator
		 */
		_toggleBusy: function(bIsBusy) {
			this.getView().byId("idProductsTable").setBusy(bIsBusy);
			this.getView().byId("idProductsTable").setBusyIndicatorDelay(0);
		},
		/**
		 * @function releases assigned resources in library
		 */
		onExit: function() {

			if (this._oValueHelpController) {
				this._oValueHelpController.exit();
			}

			// close open popovers
			if (sap.m.InstanceManager.hasOpenPopover()) {
				sap.m.InstanceManager.closeAllPopovers();
			}
			// close open dialogs
			if (sap.m.InstanceManager.hasOpenDialog()) {
				sap.m.InstanceManager.closeAllDialogs();
			}

			//deregister MessageModel
			this.getView().getModel("message").detachMessageChange(this._onMessageChange, this);

		},

		onMessagesButtonPress: function(oEvent) {

			var oMessagesButton = oEvent.getSource();
			this._oMessagePopover.toggle(oMessagesButton);
		},

		onAfterRendering: function() { //rerendering checks for new messages
			if ((this._MessageShown !== undefined) && (this._MessageShown === false)) {
				this._oMessagePopover.openBy(this.getView().byId("idMessageIndicator"));
				this._MessageShown = true;
			}

			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") {
				//adjust later
				var aFilters = [];
				aFilters.push(new sap.ui.model.Filter("MovementType", sap.ui.model.FilterOperator.EQ, "101"));
				this.getView().byId("idGoodsMovementReasonCodeSelect").getBinding("items").filter(aFilters);
			}
		},

		/**
		 * Event handler for message model changes, fired if message models is changed
		 * @param {sap.ui.base.Event}  oControlEvent
		 * @private
		 */
		_onMessageChange: function(oControlEvent) {
			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S1" && this.getView().byId("idPage").getMessagesIndicator()
				.getDomRef() !== null) { //allready con
				this._oMessagePopover.openBy(this.getView().byId("idMessageIndicator"));
			} else {
				this._MessageShown = false;
			}
		},

		/* =========================================================== */
		/* Attachment                                                  */
		/* =========================================================== */
		/**
		/*Code for Attachments*/
		_loadAttachmentComponent: function() {
			try {

				var oModel = this.getView().getModel("oFrontend");
				var Pur_order = oModel.getProperty("/Ebeln");

				if (Pur_order) {
					var tempkey = this.getUniqueKey();
					var asMode = "I";
					var objectType = "BUS2017";
					this.temp_objectKey = Pur_order + "GR" + tempkey;
					if (!this.oCompAttachProj) {
						//check if app runs with mock data
						if (this.getOwnerComponent().getModel("oDataHelp").getServiceMetadata().dataServices.schema[0].entityType.length >= 15) {
							this.oCompAttachProj = sap.ui.getCore().createComponent({
								name: "sap.se.mi.plm.lib.attachmentservice.attachment",
								//id: this.createId("ASComp"),
								settings: {
									mode: asMode,
									objectKey: this.temp_objectKey,
									objectType: objectType
								}
							});
							this.getView().byId("idastestcompContainer").setComponent(this.oCompAttachProj);
						} else { //app runs with mock data --> hide the attachment section
							oModel.setProperty("/AttachmentVisible", false);
						}
					}
				}

			} catch (err) { //attachment service could not be load --> hide the section
				oModel.setProperty("/AttachmentVisible", false);
			}
		}, //_loadAttachmentComponent

		getUniqueKey: function() {

			var oDateformat = sap.ui.core.format.DateFormat.getDateTimeInstance({
				pattern: "ddMMYYYYHHmmss"
			});
			var oDate = new Date();
			return oDateformat.format(oDate);

		},

		/* =========================================================== */
		/* private methods                                             */
		/* =========================================================== */
		/**
		 * @function creates initial frontend before any input
		 * @return {object} inital frontend configuration
		 */
		_getInitFrontend: function() {

			var sMaxSuggestionWidth = "50%";
			if (!jQuery.support.touch) { //setting compact on non touch devices 
				sMaxSuggestionWidth = "35%";
			}

			var oInitFrontend = {

				saveAsTileTitle: "",
				shareOnJamTitle: "",
				shareSendEmailSubject: "",
				shareSendEmailMessage: "",
				saveAsTileURL: "",
				saveAsTileSubtitle: "",
				shareInJamURL: "",
				searchPlaceholderText: "",
				fullscreenTitle: "",
				searchFieldLabel: "",

				visible: false,
				Objectheader: "",
				PostButtonEnabled: false,
				PostButtonVisible: false,
				ScanButtonVisible: false,
				DocumentDate: this._oDateFormat.format(new Date()),
				PostingDate: this._oDateFormat.format(new Date()),
				DocumentDate_valueState: sap.ui.core.ValueState.None,
				PostingDate_valueState: sap.ui.core.ValueState.None,
				ColumnBatchVisible: false, //opt in 
				Items: [],
				VersionForPrintingSlip: this._aVersionForPrintingSlip,
				VersionForPrintingSlip_selectedKey: "0",
				SourceOfGR: this._SourceOfGR,
				ExtensionSectionVisible: false, //==> controls visibility of extension section on detail page 
				maxSuggestionWidth: sMaxSuggestionWidth

			};

			if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
				oInitFrontend.fullscreenTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_PO");
				oInitFrontend.shareOnJamTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_PO");
				oInitFrontend.searchFieldLabel = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_PO");
				oInitFrontend.Ebeln_label = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_PO");
				oInitFrontend.Ebeln_maxLength = 10; //max Length used in UI 
				oInitFrontend.Ebeln_possibleLength = [10]; //possible other lengh to be supported, filled dynamically from value helps 
			} else {
				oInitFrontend.fullscreenTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_DL");
				oInitFrontend.shareOnJamTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_DL");
				oInitFrontend.searchFieldLabel = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_DL");
				oInitFrontend.Ebeln_label = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_DL");
				oInitFrontend.Ebeln_maxLength = 9; //max Length used in UI 
				oInitFrontend.Ebeln_possibleLength = [9]; //possible other lengh to be supported, filled dynamically from value helps 
			}

			return oInitFrontend;

		},
		/**
		 * @function creates initial private properties of the controller
		 */
		_initController: function() {
			//Fixed values for printing
			this._aVersionForPrintingSlip = [];
			this._aVersionForPrintingSlip.push({
				key: "0",
				text: this.getResourceBundle().getText("SELECT_ITEM_OUTPUT_NO")
			});
			this._aVersionForPrintingSlip.push({
				key: "1",
				text: this.getResourceBundle().getText("SELECT_ITEM_OUTPUT_IS")
			});
			this._aVersionForPrintingSlip.push({
				key: "2",
				text: this.getResourceBundle().getText("SELECT_ITEM_OUTPUT_ISIT")
			});
			this._aVersionForPrintingSlip.push({
				key: "3",
				text: this.getResourceBundle().getText("SELECT_ITEM_OUTPUT_CS")
			});

			//set local hard coded default in any case
			this._oPersonalizedDataContainer = {
				deliveredQuantityDefault2open: true,
				deliveredQuantityDefault20: false,
				PresetDocumentItemTextFromPO: false,
				SelectPO: true, //Value Help control --> Select Standard POs
				SelectSTO: true, //Value Help control  --> Select Stock Transport Orders
				EnableBarcodeScanning: false //BarcodeScanning Button
			};

			//defines what is stored in innerAppState
			this._oNavigationServiceFields = {
				aHeaderFields: ["DocumentDate", "PostingDate", "Ebeln", "DeliveryDocumentByVendor", "MaterialDocumentHeaderText",
					"BillOfLading", "VersionForPrintingSlip_selectedKey"
				],
				aItemFields: ["DocumentItem", "DocumentItemText", "DeliveredQuantity_input", "DeliveredUnit_input", "OpenQuantity", "Unit",
					"Plant", "StorageLocation", "StockType_selectedKey", "DeliveryCompleted"
				]
			};

			/**
			 * @property {objectl} _isIntentSupported reference to supported intents
			 */
			this._isIntentSupported = {
				GoodsReceiptDisplay: false, //Controller wide store
				SupplierDisplay: false,
				MaterialDisplay: false,
				PurchaseOrderDisplay: false,
				BatchCreate: false
			};

		},

		// Formatter 
		/**
		 * @function formatter to put name + key in brackets
		 * @param {string} iValueName name of value
		 * @param {string} iValue key of value
		 * @retrun {string} formatted string
		 */
		concatenateNameIdFormatter: function(iValueName, iValueId) {
			if (iValueName) {
				if (iValueId !== "") {
					iValueName = iValueName + " (" + iValueId + ")";
				}
				return iValueName;
			} else {
				//provide id if name is not supplied
				if (iValueId) {
					return iValueId;
				} else { //no name and id
					return null;
				}
			}
		}, //End Formatter adds field Id with brackets
		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Navigates back in the browser history, if the entry was created by this app.
		 * If not, it navigates to the Fiori Launchpad home page.
		 * @public
		 */
		onNavBack: function() {
			var oHistory = sap.ui.core.routing.History.getInstance(),
				sPreviousHash = oHistory.getPreviousHash();
			var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");

			if (sPreviousHash !== undefined || !oCrossAppNavigator.isInitialNavigation()) {
				// The history contains a previous entry
				oCrossAppNavigator.backToPreviousApp();
			} else {
				// Navigate back to FLP home
				oCrossAppNavigator.toExternal({
					target: {
						shellHash: "#"
					}
				});
			}
		},

		/**
		 * Event handler when the share in JAM button has been clicked
		 * @public
		 */
		onShareInJamPress: function() {
			var oViewModel = this.getModel("worklistView"),
				oShareDialog = sap.ui.getCore().createComponent({
					name: "sap.collaboration.components.fiori.sharing.dialog",
					settings: {
						object: {
							id: location.href,
							share: oViewModel.getProperty("/shareOnJamTitle")
						}
					}
				});
			oShareDialog.open();
		},
		///paste
		/**
		 * @function type ahead event handler of PO entry field
		 * @param {sap.ui.base.Event} oEvent object supplied by the UI
		 */
		handleSuggest: function(oEvent) {
			var sTerm = oEvent.getParameter("suggestValue");
			if (sTerm) {
				var oFilter = {};
				var aFilters = [];
				var aFilterComplete = [];
				var oFilterComplete = {};
				// search for PO after 4 digits
				if (sTerm.length > 3) {
					aFilters.push(new sap.ui.model.Filter("InboundDelivery", sap.ui.model.FilterOperator.Contains, sTerm));
				}
				// search for supplier
				if (this._oPersonalizedDataContainer.SelectPO === true || this._SourceOfGR === this._SourceOfGRIsInboundDelivery) {
					aFilters.push(new sap.ui.model.Filter("VendorName", sap.ui.model.FilterOperator.Contains, sTerm));
				}

				if (this._oPersonalizedDataContainer.SelectSTO === true && this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
					aFilters.push(new sap.ui.model.Filter("SupplyingPlant", sap.ui.model.FilterOperator.Contains, sTerm));
					aFilters.push(new sap.ui.model.Filter("SupplyingPlantName", sap.ui.model.FilterOperator.Contains, sTerm));
				}

				oFilter = new sap.ui.model.Filter(aFilters, false);

				//Source of GR as filter criteria
				aFilterComplete.push(oFilter);
				aFilterComplete.push(new sap.ui.model.Filter("SourceOfGR", sap.ui.model.FilterOperator.EQ, this._SourceOfGR));

				//		oEvent.getSource().getBinding("suggestionItems").filter(oFilter);

				oFilterComplete = new sap.ui.model.Filter(aFilterComplete, true);

				this.getView().byId("POInput").removeAllSuggestionColumns();
				var oTemplate = new sap.m.ColumnListItem({
					cells: [new sap.m.Label({
						text: "{oData>InboundDelivery}"
					})]
				});

				if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
					this.getView().byId("POInput").addSuggestionColumn(
						new sap.m.Column({
							header: new sap.m.Label({
								text: this.getResourceBundle().getText("PO_SEARCH_FIELD_LABEL")
							})
						})
					);
				} else {
					this.getView().byId("POInput").addSuggestionColumn(
						new sap.m.Column({
							header: new sap.m.Label({
								text: this.getResourceBundle().getText("DL_SEARCH_FIELD_LABEL")
							})
						})
					);
				}

				if (this._oPersonalizedDataContainer.SelectPO === true || this._SourceOfGR === this._SourceOfGRIsInboundDelivery) {
					oTemplate.addCell(
						new sap.m.Label({
							text: "{oData>VendorName}"
						}));

					this.getView().byId("POInput").addSuggestionColumn(
						new sap.m.Column({
							header: new sap.m.Label({
								text: this.getResourceBundle().getText("SUPPLIER_SEARCH_FIELD_LABEL")
							})
						})
					);

				}

				if (this._oPersonalizedDataContainer.SelectSTO === true && this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
					oTemplate.addCell(
						new sap.m.Label({
							//	text: "{parts:[{path:'oData>SupplyingPlantName'}, {path:'oData>SupplyingPlant'}], formatter: 'this.concatenateNameIdFormatter' }"
							text: "{oData>SupplyingPlant}"
						}));

					this.getView().byId("POInput").addSuggestionColumn(
						new sap.m.Column({
							header: new sap.m.Label({
								text: this.getResourceBundle().getText("SUPPLYINGPLANT_SEARCH_FIELD_LABEL")
							})
						})
					);

				}

				this.getView().byId("POInput").bindAggregation("suggestionRows", {
					path: "/GR4PO_DL_Headers",
					model: "oData",
					filters: aFilterComplete,
					template: oTemplate
				});

				this.getView().byId("POInput").getBinding("suggestionRows").attachDataReceived(
					this._setEbelnPossibleLength, this);

			}
		}, //end handleSuggest
		/** 
		 * @function private call back to calculate possible length of purchaseorder/inbound delivery key 
		 * @param {sap.ui.base.Event} oEvent object supplied by the oData Service DataReceived EVent 
		 */
		_setEbelnPossibleLength: function(oEvent) {
			if (oEvent.getParameter("data") && oEvent.getParameter("data").results.length > 0) {
				var aEbeln_possibleLength = this.getView().getModel("oFrontend").getProperty("/Ebeln_possibleLength");
				var sEbeln;
				for (var i = 0; i < oEvent.getParameter("data").results.length; i++) {
					if (oEvent.getParameter("data").results[i].InboundDelivery) { //dynamic call, also from value help 
						sEbeln = oEvent.getParameter("data").results[i].InboundDelivery;
					} else {
						if (oEvent.getParameter("data").results[i].PurchaseOrder) {
							sEbeln = oEvent.getParameter("data").results[i].PurchaseOrder;
						}
					}
					if (aEbeln_possibleLength.indexOf(parseInt(sEbeln.length, 10)) === -1) { //new length ? 
						aEbeln_possibleLength.push(parseInt(sEbeln.length, 10));
					}
				}
				this.getView().getModel("oFrontend").setProperty("/Ebeln_possibleLength", aEbeln_possibleLength); //Write Back 
			}
		},

		/**
		 * @function value Help of PO entry field based on ValueHelpDialog and Entity /PoHelpSet
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handlePOHelp: function(oEvent) {
			var resourceBundle = this.getResourceBundle();
			var that = this;
			var sTitle = "";
			if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
				sTitle = resourceBundle.getText("TITLE_PO_HELP");
			} else {
				sTitle = resourceBundle.getText("TITLE_DL_HELP");
			}
			var oPOValueHelpDialog = new sap.ui.comp.valuehelpdialog.ValueHelpDialog({
				//basicSearchText: resourceBundle.getText("SEARCHTEXT_PO_HELP") ,
				id: "idValueHelpDialog",
				title: sTitle,
				modal: true,
				supportMultiselect: false,
				supportRanges: false,
				supportRangesOnly: false,

				ok: function(oControlEvent) {
					var aTokens = oControlEvent.getParameter("tokens");

					var oRow = aTokens[0].data(); //oRow.row.PurchaseOrder
					var sPurchaseOrderNumber = "";
					oPOValueHelpDialog.close();

					// write selected value back
					if (that._SourceOfGR === that._SourceOfGRIsPurchaseOrder) {
						sPurchaseOrderNumber = oRow.row.PurchaseOrder;
					} else {
						sPurchaseOrderNumber = oRow.row.DeliveryDocument;
					}
					if (sPurchaseOrderNumber) {
						var oPOInput = that.getView().byId("POInput");
						oPOInput.setValue(sPurchaseOrderNumber);
						//oPOInput.fireSuggestionItemSelected({selectedItem:new sap.ui.core.Item( {text:sPurchaseOrderNumber})});
						oPOInput.fireChangeEvent(sPurchaseOrderNumber);
					}
				},

				cancel: function(oControlEvent) {
					oPOValueHelpDialog.close();
				},

				afterClose: function() {
					oPOValueHelpDialog.destroy();
				}
			});

			var sPath = "";
			var aCols = [];
			var sSelect = "";
			if (that._SourceOfGR === that._SourceOfGRIsPurchaseOrder) { //Purchase Order
				sPath = "/PoHelpSet";

				aCols = [{
					label: resourceBundle.getText("LABEL_PO_COL"),
					template: "PurchaseOrder"
				}, {
					label: resourceBundle.getText("LABEL_PO_TYPE_TEXT"),
					template: "PurchasingDocumentTypeName"
				}, {
					label: resourceBundle.getText("LABEL_PO_ITEMTYPE_TEXT"),
					template: "PurchaseOrderItem"
				}];

				sSelect = "PurchaseOrder,PurchaseOrderItem,PurchasingDocumentTypeName";

				//Standard PO
				if (that._oPersonalizedDataContainer.SelectPO === true) {
					aCols.push({
						label: resourceBundle.getText("LABEL_SUP_COL"),
						template: "Supplier"
					});
					aCols.push({
						label: resourceBundle.getText("LABEL_SUP_NAME_COL"),
						template: "SupplierName"
					});
					aCols.push({
						label: resourceBundle.getText("LABEL_CITY_COL"),
						template: "SupplierCityName"
					});

					sSelect += ",Supplier,SupplierName,SupplierCityName";
				}

				//STO
				if (that._oPersonalizedDataContainer.SelectSTO === true) {
					aCols.push({
						label: resourceBundle.getText("SUPPLYINGPLANT_SEARCH_FIELD_LABEL"),
						template: "SupplyingPlant"
					});
					aCols.push({
						label: resourceBundle.getText("SUPPLYINGPLANTNAME_SEARCH_FIELD_LABEL"),
						template: "SupplyingPlantName"
					});
					sSelect += ",SupplyingPlant,SupplyingPlantName";
				}
				//Material
				aCols.push({
					label: resourceBundle.getText("LABEL_MATERIAL_COL"),
					template: "Material"
				});
				aCols.push({
					label: resourceBundle.getText("LABEL_MATERIAL_TXT_COL"),
					template: "PurchaseOrderItemText" //can also be from the PO
				});

				sSelect += ",Material,PurchaseOrderItemText";
			} else { // Inbound Delivery
				sPath = "/InbDelHelpSet";

				aCols = [{
					label: resourceBundle.getText("LABEL_DL_COL"),
					template: "DeliveryDocument"
				}, {
					label: resourceBundle.getText("LABEL_DL_ITEM_TEXT"),
					template: "DeliveryDocumentItem"
				}, {
					label: resourceBundle.getText("LABEL_MATERIAL_TXT_COL"),
					template: "DeliveryDocumentItemText"
				}, {
					label: resourceBundle.getText("LABEL_SUP_COL"),
					template: "Supplier"
				}, {
					label: resourceBundle.getText("LABEL_SUP_NAME_COL"),
					template: "SupplierName"
				}, {
					label: resourceBundle.getText("LABEL_CITY_COL"),
					template: "SupplierCityName"
				}, {
					label: resourceBundle.getText("LABEL_PO_COL"),
					template: "PurchaseOrder"
				}, {
					label: resourceBundle.getText("LABEL_PO_ITEMTYPE_TEXT"),
					template: "PurchaseOrderItem"
				}];
				sSelect =
					"DeliveryDocument,DeliveryDocumentItem,DeliveryDocumentItemText,PurchaseOrder,PurchaseOrderItem,Supplier,SupplierName,SupplierCityName";
			}
			var oColModel = new sap.ui.model.json.JSONModel({
				cols: aCols
			});
			oPOValueHelpDialog.setModel(oColModel, "columns");
			oPOValueHelpDialog.setModel(this.getView().getModel("oData"));

			//Presetting a search term from main windwo
			var oPOInput = this.getView().byId("POInput");
			var sFilterTerm = "";
			if (oPOInput.getValue().length > 0) {
				sFilterTerm = oPOInput.getValue();
			}

			//FilterBar
			var oFilterBar = new sap.ui.comp.filterbar.FilterBar({
				advancedMode: true,
				expandAdvancedArea: false,
				filterItems: [new sap.ui.comp.filterbar.FilterItem({
					name: "s1",
					label: this.getResourceBundle().getText("SEARCH_FIELD_TOOLTIP"),
					control: new sap.m.SearchField({
						value: sFilterTerm,
						tooltip: this.getResourceBundle().getText("SEARCH_FIELD_TOOLTIP"),
						showSearchButton: false
					})
				})],

				search: function(oEvent) {
					var params = oEvent.getParameters();

					var sSearch = params.selectionSet[0].getValue();
					if (sSearch.length > 0) {
						var mParams = {
							custom: {
								"search": sSearch
							},
							select: sSelect
						};
						oPOValueHelpDialog.getTable().bindAggregation("rows", {
							path: sPath,
							parameters: mParams,

						});
						oPOValueHelpDialog.setBusy(true);
					} else { // reset search
						//					oPOValueHelpDialog.getTable().bindRows("/PoHelpSet");
						oPOValueHelpDialog.getTable().bindAggregation("rows", {
							path: sPath,
							parameters: {
								select: sSelect
							}
						});
						oPOValueHelpDialog.setBusy(true);
					}

					//	
					oPOValueHelpDialog.getTable().getBinding("rows").attachDataReceived(
						function(oDataEvent) {
							oPOValueHelpDialog.setBusy(false);
							that._setEbelnPossibleLength(oDataEvent);
						}, this);
				}
			});

			oPOValueHelpDialog.setFilterBar(oFilterBar);

			//Model binding 
			if (sFilterTerm) { //preset ?
				var mParams2 = {
					custom: {
						"search": sFilterTerm
					},
					select: sSelect
				};
				oPOValueHelpDialog.getTable().bindAggregation("rows", {
					path: sPath,
					parameters: mParams2,

				});
				oPOValueHelpDialog.setBusy(true);
			} else { // no presetting
				//				oPOValueHelpDialog.getTable().bindRows("/PoHelpSet");
				oPOValueHelpDialog.getTable().bindAggregation("rows", {
					path: sPath,
					parameters: {
						select: sSelect
					}
				});
				oPOValueHelpDialog.setBusy(true);
			}

			oPOValueHelpDialog.getTable().getBinding("rows").attachDataReceived(
				function(oDataEvent) {
					oPOValueHelpDialog.setBusy(false);
					that._setEbelnPossibleLength(oDataEvent);
				}, this);

			oPOValueHelpDialog.open();
		},

		/**
		 * @function value help of Storage Location based on included library
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleStorageLocationHelp: function(oEvent) {
			var aValidStockTypesPerItem = [];
			var aValidStockTypes = [];
			var sMaterial = "";
			var sPlant = "";
			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S1") {
				var oSource = oEvent.getSource();
				var oParent = oSource.getParent();
				var aCells = oParent.getCells();
				sMaterial = aCells[1].getText();
				sMaterial = sMaterial.substr(1, sMaterial.length - 2);

				//getting the index of the table item and storing it in controller
				this._SelectedTableIndex = this._getSelectedItemInModel(oEvent);

				var oModel = this.getView().getModel("oFrontend");
				var aItems = oModel.getProperty("/Items");
				sPlant = aItems[this._SelectedTableIndex].Plant;
				aValidStockTypesPerItem = aItems[this._SelectedTableIndex].StockType_input;
			} //S1 view
			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") {
				var oItem = this.getModel("oItem");
				sMaterial = oItem.getProperty("/Material");
				sPlant = oItem.getProperty("/Plant");
				aValidStockTypesPerItem = oItem.getProperty("/StockType_input");
			} //S2 view

			for (var i = 0; i < aValidStockTypesPerItem.length; i++) {
				switch (aValidStockTypesPerItem[i].key) {
					case " ":
						aValidStockTypes.push("CurrentStock");
						break;
					case "2":
						aValidStockTypes.push("QualityInspectionStockQuantity");
						break;
					case "3":
						aValidStockTypes.push("BlockedStockQuantity");
				}
			}

			var that = this;
			var oParams = {};
			oParams.Material = sMaterial;
			oParams.Plant = sPlant;
			oParams.DisplayedStockTypes = aValidStockTypes;
			if (this._ResetStorageLocationBuffer === true) {
				oParams.resetBuffer = true;
				this._ResetStorageLocationBuffer = false; //resetting the buffer
			}
			this._oValueHelpController.displayValueHelpStorageLocation4Material(oParams, function(oReturn) {
				that._handleValueHelpStorageLocationCallback(oReturn);
			}, that);

		},

		/**
		 * @function call back function of Storage Location value Help
		 * @param oReturn Provided by Value Help containing selected values/or no selection
		 */
		_handleValueHelpStorageLocationCallback: function(oReturn) {
			var bSelectEnabled = false;
			if (oReturn.selected === true) {
				if (this.getView().sViewName == "s2p.mm.im.goodsreceipt.purchaseorder.view.S1") {
					var oModel = this.getView().getModel("oFrontend");
					oModel.setProperty("/Items/" + this._SelectedTableIndex + "/StorageLocation", oReturn.StorageLocation);
					oModel.setProperty("/Items/" + this._SelectedTableIndex + "/StorageLocation_input", oReturn.StorageLocationName);
					oModel.setProperty("/Items/" + this._SelectedTableIndex + "/StorageLocation_valueState", sap.ui.core.ValueState.None);
					oModel.setProperty("/Items/" + this._SelectedTableIndex + "/StorageLocation_valueStateText", "");
					bSelectEnabled = this._ItemConsistent(oModel.getProperty("/Items/" + this._SelectedTableIndex));
					if (bSelectEnabled == true) {
						oModel.setProperty("/Items/" + this._SelectedTableIndex + "/SelectEnabled", bSelectEnabled);
						oModel.setProperty("/Items/" + this._SelectedTableIndex + "/Selected", bSelectEnabled);
					}
					//take care of select for (sub)items
					this._setSelectEnabled(oModel.getProperty("/Items/" + this._SelectedTableIndex));
					this._controlSelectAllAndPostButton(); //update buttons

				}
				if (this.getView().sViewName == "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") {
					var oItem = this.getView().getModel("oItem");
					oItem.setProperty("/StorageLocation", oReturn.StorageLocation);
					oItem.setProperty("/StorageLocation_input", oReturn.StorageLocationName);
					oItem.setProperty("/StorageLocation_valueState", sap.ui.core.ValueState.None);
					oItem.setProperty("/StorageLocation_valueStateText", "");
					bSelectEnabled = this._ItemConsistent(oItem.getData());
					if (bSelectEnabled == true) {
						oItem.setProperty("/SelectEnabled", bSelectEnabled);
						oItem.setProperty("/Selected", bSelectEnabled);
						oItem.setProperty("/ApplyButtonEnabled", bSelectEnabled);
					}
					//select all is handled in nav back event
				}
			} //selected
		},

		/**
		 * @function value help of Alternative Units of Measure (AUoM) based on included library
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */

		handleAUoMHelp: function(oEvent) {

			var sMaterial = "";
			var oSource = oEvent.getSource();
			if (this.getView().sViewName == "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") { //S2

				sMaterial = this.getView().getModel("oItem").getProperty("/Material");

			} else { //S1
				var oParent = oSource.getParent().getParent();

				var aCells = oParent.getCells();
				sMaterial = aCells[1].getText();
				sMaterial = sMaterial.substr(1, sMaterial.length - 2);

				//getting the index of the table item and storing it in controller
				this._SelectedTableIndex = this._getSelectedItemInModel(oEvent);
			} //S1

			var that = this;
			var oParams = {};
			oParams.Material = sMaterial;
			this._oValueHelpController.displayValueHelpAUOM4Material(oParams, function(oReturn) {
				that._handleValueHelpAUOMCallback(oReturn);
			}, that);

		}, //end handleAUoMConfirm

		/**
		 * @function call back function of AUoM  value Help
		 * @param oReturn Provided by Value Help containing selected values/or no selection
		 */
		_handleValueHelpAUOMCallback: function(oReturn) { // callback function
			var oModel = {}; //JSON model
			if (oReturn.selected === true) {
				if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") { //S2
					//Write local back  
					oModel = this.getView().getModel("oItem");

					var bSelectEnabled = this._ItemConsistent(oModel.getData());
					if (bSelectEnabled == true) {
						oModel.setProperty("/SelectEnabled", bSelectEnabled);
						oModel.setProperty("/Selected", bSelectEnabled);
					}
					//subitems are handled in nav back event handler

					oModel.setProperty("/DeliveredUnit_input", oReturn.AUoM);

					// //Write central back
					// var oApplicationModel = this.oApplicationFacade.getApplicationModel("oItem");
					// oApplicationModel.setProperty("/DeliveredUnit_input", oReturn.AUoM);
				} else { // S1
					//writing back to JSON Model
					oModel = this.getView().getModel("oFrontend");
					var aItems = oModel.getProperty("/Items");

					if (aItems[this._SelectedTableIndex].DeliveredUnit_input !== oReturn.AUoM) {
						aItems[this._SelectedTableIndex].DeliveredUnit_input = oReturn.AUoM;
					}

					var bSelectEnabled = this._ItemConsistent(aItems[this._SelectedTableIndex], aItems);
					if (bSelectEnabled == true) {
						aItems[this._SelectedTableIndex].SelectEnabled = bSelectEnabled;
						aItems[this._SelectedTableIndex].Selected = bSelectEnabled;
					}

					//update select all of subitems
					this._setSelectEnabled(aItems[this._SelectedTableIndex], aItems);
					this._controlSelectAllAndPostButton(); //update buttons

					oModel.setProperty("/Items", aItems);
				} //S1
			}
		},

		/**
		 * @function value help of Batch per PO Item
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleBatchHelp: function(oEvent) {

			//reset buffer if needed
			if (this._ResetBatchBuffer === true) {
				this._ResetBatchBuffer = false;
				this._oBatchHelp = {};
			}

			var oItem = {};

			if (!this._oBatchDialog) {
				//	if (sap.ui.getCore().byId("idSelectBatchDialog") === undefined) { //second controller instance
				this._oBatchDialog = sap.ui.xmlfragment(this.getView().getId(), "s2p.mm.im.goodsreceipt.purchaseorder.view.selectBatch", this);
				this.getView().addDependent(this._oBatchDialog);
				jQuery.sap.syncStyleClass("sapUiSizeCompact", this.getView(), this._oBatchDialog);
				// } else {
				// 	this._oBatchDialog = sap.ui.getCore().byId("idSelectBatchDialog");
				// }

			}

			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") { //S2
				oItem = this.getView().getModel("oItem").getData();
			} else {
				var oModel = this.getView().getModel("oFrontend");
				oItem = oModel.getProperty("/Items/" + this._getSelectedItemInModel(oEvent));
				//Store selected item in Controller
				this._SelectedTableIndex = this._getSelectedItemInModel(oEvent);
			}

			//set micro chart bars to customized ones
			//	var oMicroChart = sap.ui.getCore().byId("idBatchStockChart");

			var oMicroChart = sap.ui.core.Fragment.byId(this.getView().getId(), "idBatchStockChart");
			var sDisplayStockType = "";
			oMicroChart.removeAllData();
			for (var j = 0; j < oItem.StockType_input.length; j++) {
				switch (oItem.StockType_input[j].key) {
					case "2":
						sDisplayStockType = "QualityInspectionStockQuantity";
						break;
					case "3":
						sDisplayStockType = "BlockedStockQuantity";
						break;
					default:
						sDisplayStockType = "CurrentStock";
				}
				oMicroChart.addData(new sap.suite.ui.microchart.ComparisonMicroChartData({
					color: "Good",
					displayValue: "{oBatchCollection>" + sDisplayStockType + "_Dis" + "}",
					value: "{oBatchCollection>" + sDisplayStockType + "_Int" + "}",
					title: "{i18n>BATCH_VALUE_HELP_CHART_TITLE_" + sDisplayStockType.toUpperCase() + "}"
				}));
			}

			if (!this._oBatchHelp[oItem.DocumentItem]) { //read from backend only if required

				var aFilters = [];

				aFilters.push(new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.EQ, oItem.Material));
				aFilters.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, oItem.Plant));
				aFilters.push(new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.EQ, oItem.Material));
				aFilters.push(new sap.ui.model.Filter("StorageLocation", sap.ui.model.FilterOperator.EQ, oItem.StorageLocation));
				aFilters.push(new sap.ui.model.Filter("DeliveryDocumentItem", sap.ui.model.FilterOperator.EQ, oItem.DocumentItem));
				aFilters.push(new sap.ui.model.Filter("InboundDelivery", sap.ui.model.FilterOperator.EQ, this.getView().getModel("oFrontend").getProperty(
					"/Ebeln")));

				this.getView().getModel("oData").read("/MaterialBatchHelps", {
					filters: aFilters,
					success: jQuery.proxy(this._successBatchLoad, this, oItem),
					error: jQuery.proxy(this._handleOdataError, this)
				});

			} else { // use internal buffer

				var oBatchCollection = new sap.ui.model.json.JSONModel();
				oBatchCollection.setDefaultBindingMode("OneWay");
				oBatchCollection.setProperty("/BatchCollection", this._oBatchHelp[oItem.DocumentItem]);
				var oMinMax = this._getMinMaxOfDisplayedStocks(this._oBatchHelp[oItem.DocumentItem], oItem.StockType_input);
				oBatchCollection.setProperty("/minValue", oMinMax.minValue);
				oBatchCollection.setProperty("/maxValue", oMinMax.maxValue);
				this._oBatchDialog.setModel(oBatchCollection, "oBatchCollection");
				this._oBatchDialog.open();
			}
		},
		/**
		 * @function callback of successfull load of StorageLocations
		 * @param {object} oData Resultset retrieved from Backend
		 * @param {object} oParam Input parameters
		 */
		_successBatchLoad: function(oParam, oData) {

			var aBatchCollection = new Array();
			for (var i = 0; i < oData.results.length; i++) {
				var oItem = {};
				oItem.Batch = oData.results[i].Batch;
				oItem.BaseUnit = oData.results[i].BaseUnit;

				oItem.BlockedStockQuantity_Dis = this._NumberFormatter.format(oData.results[i].BlockedStockQuantity, oItem.BaseUnit) + " ";
				oItem.CurrentStock_Dis = this._NumberFormatter.format(oData.results[i].CurrentStock, oItem.BaseUnit) + " ";
				oItem.QualityInspectionStockQuantity_Dis = this._NumberFormatter.format(oData.results[i].QualityInspectionStockQuantity, oItem.BaseUnit) +
					" ";
				// oItem.ReturnsBlockedStockQuantity_Dis = this._NumberFormatter.format(oData.results[i].ReturnsBlockedStockQuantity, oItem.BaseUnit) +
				// 	" ";
				// oItem.TransferStockStorageLocQty_Dis = this._NumberFormatter.format(oData.results[i].TransferStockStorageLocQty, oItem.BaseUnit) +
				// 	" ";
				// oItem.RestrictedStockQuantity_Dis = this._NumberFormatter.format(oData.results[i].RestrictedStockQuantity, oItem.BaseUnit) + " ";
				oItem.BlockedStockQuantity_Int = parseFloat(oData.results[i].BlockedStockQuantity);
				oItem.CurrentStock_Int = parseFloat(oData.results[i].CurrentStock);
				oItem.QualityInspectionStockQuantity_Int = parseFloat(oData.results[i].QualityInspectionStockQuantity);
				// oItem.ReturnsBlockedStockQuantity_Int = parseFloat(oData.results[i].ReturnsBlockedStockQuantity);
				// oItem.TransferStockStorageLocQty_Int = parseFloat(oData.results[i].TransferStockStorageLocQty);
				// oItem.RestrictedStockQuantity_Int = parseFloat(oData.results[i].RestrictedStockQuantity);
				oItem.BlockedStockQuantity = oData.results[i].BlockedStockQuantity;
				oItem.CurrentStock = oData.results[i].CurrentStock;
				oItem.QualityInspectionStockQuantity = oData.results[i].QualityInspectionStockQuantity;
				// oItem.ReturnsBlockedStockQuantity = oData.results[i].ReturnsBlockedStockQuantity;
				// oItem.TransferStockStorageLocQty = oData.results[i].TransferStockStorageLocQty;
				// oItem.RestrictedStockQuantity = oData.results[i].RestrictedStockQuantity;

				aBatchCollection.push(oItem);
			}

			//in call back of oData Service
			this._oBatchHelp[oParam.DocumentItem] = aBatchCollection;

			var oBatchCollection = new sap.ui.model.json.JSONModel();
			oBatchCollection.setDefaultBindingMode("OneWay");
			oBatchCollection.setProperty("/BatchCollection", this._oBatchHelp[oParam.DocumentItem]);
			var oMinMax = this._getMinMaxOfDisplayedStocks(this._oBatchHelp[oParam.DocumentItem], oParam.StockType_input);
			oBatchCollection.setProperty("/minValue", oMinMax.minValue);
			oBatchCollection.setProperty("/maxValue", oMinMax.maxValue);
			this._oBatchDialog.setModel(oBatchCollection, "oBatchCollection");
			this._oBatchDialog.open();

		},

		/**
		 * @function calculates the Minimum and Maximum of displayed Stocks in Model
		 * @param {array} aCollection Array with Stock Quantities
		 * @param {array} aDisplayedStocks Object Displayed Stocktypes 
		 * @return {object} object containing minValue/maxValue as float
		 */
		_getMinMaxOfDisplayedStocks: function(aCollection, aDisplayedStocks) {
			var oMinMax = {
				minValue: 0.0,
				maxValue: 0.0
			};

			//changing key to oData
			var sDisplayStockType = "";

			for (var i = 0; i < aDisplayedStocks.length; i++) {
				switch (aDisplayedStocks[i].key) {
					case "2":
						sDisplayStockType = "QualityInspectionStockQuantity";
						break;
					case "3":
						sDisplayStockType = "BlockedStockQuantity";
						break;
					default:
						sDisplayStockType = "CurrentStock";
				}

				//all items
				for (var j = 0; j < aCollection.length; j++) {
					if (aCollection[j][sDisplayStockType + "_Int"] > oMinMax.maxValue) {
						oMinMax.maxValue = aCollection[j][sDisplayStockType + "_Int"];
					}
					if (aCollection[j][sDisplayStockType + "_Int"] < oMinMax.minValue) {
						oMinMax.minValue = aCollection[j][sDisplayStockType + "_Int"];
					}
				} //all stocks
			} //all stock types

			return oMinMax;
		},

		/**
		 * @function handler for Search in Batches
		 * @param {sap.ui.base.Event} oEvent Event object of the UI
		 */
		handleBatchValueHelpSearch: function(oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new sap.ui.model.Filter("Batch", sap.ui.model.FilterOperator.Contains, sValue);
			var oBinding = oEvent.getSource().getBinding("items");
			oBinding.filter([oFilter]);
		},
		/**
		 * @function handler for cancel in Batche Value Help
		 * @param {object} oEvent Event object of the UI
		 */
		handleBatchValueHelpCancel: function(oEvent) {
			oEvent.getSource().getBinding("items").filter([]);

		},
		/**
		 * @function handler for confirm in Batch Value Help
		 * @param {sap.ui.base.Event} oEvent Event object of the UI
		 */
		handleBatchValueHelpConfirm: function(oEvent) {
			oEvent.getSource().getBinding("items").filter([]);

			var aContexts = oEvent.getParameter("selectedContexts");
			oEvent.getSource().getBinding("items").filter([]);
			if (aContexts.length) {
				if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") { //S2

					this.getView().getModel("oItem").setProperty("/Batch", aContexts[0].getObject().Batch);

				} else {
					var oModel = this.getView().getModel("oFrontend");
					oModel.setProperty("/Items/" + this._SelectedTableIndex + "/Batch", aContexts[0].getObject().Batch);
				}
			} //context available
		},

		/**
		 * @function handler for creating a batch by external application
		 * @param {sap.ui.base.Event} oEvent Event object of the UI
		 */
		handleCreateBatch: function(oEvent) {
			var oParams = {
				Material: this.getView().getModel("oItem").getProperty("/Material"),
				Plant: this.getView().getModel("oItem").getProperty("/Plant")
			};

			this._ResetBatchBuffer = true; //invalidate local buffer due to create operation

			this._oNavigationService.navigate("Batch", "create", oParams, this._getInnerAppState());
		},

		/**
		 * @function handler for Search function in Table
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleSearch: function(oEvent) {
			var sValue = oEvent.getParameter("query");
			var oTable = this.getView().byId("idProductsTable");
			var oModel = this.getView().getModel("oFrontend");
			var oBinding = oTable.getBinding("items");
			var oFilter = {};
			var aFilters = [];
			if (sValue.length > 0) {
				aFilters.push(new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.Contains, sValue));
				aFilters.push(new sap.ui.model.Filter("MaterialName", sap.ui.model.FilterOperator.Contains, sValue));
				aFilters.push(new sap.ui.model.Filter("PurchaseOrderItemText", sap.ui.model.FilterOperator.Contains, sValue));
				oFilter = new sap.ui.model.Filter(aFilters, false);
				oTable.getBinding("items").filter(oFilter);
			} else {
				oTable.getBinding("items").filter([]);
			}

			//get items count for refreshing table header label
			var resourceBundle = this.getResourceBundle();
			var aItems = oTable.getItems();
			var iVisibleItems = 0;
			for (var i = 0; i < aItems.length; i++) {
				var bInfo = aItems[i].getCells()[0].getProperty("visible");
				if (bInfo == true) {
					iVisibleItems++;
				}
			}

			var sPOItemsCountTableHeader = resourceBundle.getText("TABLE_ITEMS_LABEL", [iVisibleItems, this._iTableRowsCount]);
			oModel.setProperty("/POItemsCountTableHeader", sPOItemsCountTableHeader);
		}, //end handleSearch

		/**
		 * @function handler to display popin window with Account Assigment details in table based on XML fragment
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		onDisplayAccountAssignment: function(oEvent) {
			if (!this._oAccAssDialog) {
				this._oAccAssDialog = sap.ui.xmlfragment("s2p.mm.im.goodsreceipt.purchaseorder.view.accountAssignment", this);
				this.getView().addDependent(this._oAccAssDialog);
			}
			//determine account details of current material
			//var oTable = this.getView().byId("idProductsTable");
			//var oListItem = oEvent.getSource().getParent();
			//var iSelectedTableIndex = oTable.indexOfItem(oListItem);
			//var sPath = oEvent.getSource().getBindingContext("oFrontend").getPath();
			//var iSelectedTableIndex = parseInt(sPath.substring(7, sPath.length) );
			var iSelectedTableIndex = this._getSelectedItemInModel(oEvent);
			var oFrontendModel = this.getView().getModel("oFrontend");
			var oModel = oFrontendModel.getData();
			var oItem = oModel.Items[iSelectedTableIndex];

			var oItemModel = new sap.ui.model.json.JSONModel();
			oItemModel.setData(oItem);

			this._oAccAssDialog.setModel(oItemModel, "oItem");
			var oButton = oEvent.getSource();
			jQuery.sap.delayedCall(0, this, function() {
				this._oAccAssDialog.openBy(oButton);
			});
			//this._oAccAssDialog.open();

		}, //end onDisplayAccountAssignment

		/**
		 * @function handler of select all items in table checkbox
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleSelectAll: function(oEvent) {
			var bSelected = oEvent.getParameter("selected");
			var oModel = this.getView().getModel("oFrontend");
			var aItems = oModel.getProperty("/Items");
			if (bSelected) {
				for (var i = 0; i < aItems.length; i++) {
					if (aItems[i].SelectEnabled) {
						aItems[i].Selected = true;
					}

					oModel.setProperty("/PostButtonEnabled", true);
					// this.setBtnEnabled("postBtn", true); //activate post button
				}
			} else {
				for (var i = 0; i < aItems.length; i++) {
					if (aItems[i].SelectEnabled) {
						aItems[i].Selected = false;
					}

					oModel.setProperty("/PostButtonEnabled", false);
				}
			} //else
			oModel.setProperty("/Items", aItems);
		}, //end handleSelectAll

		/**
		 * @function handler of select one items in table checkbox
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleSelect: function(oEvent) {
			var bSelected = oEvent.getParameter("selected");
			var oModel = this.getView().getModel("oFrontend");
			var aItems = oModel.getProperty("/Items");

			//if at least one item is not selected --> deactivate the all checkbox
			/*var bSelectAll = true;
		for(var i = 0; i < aItems.length; i++ ){
			if((aItems[i].Selected == false ) && (aItems[i].ItemCounter == 0)) 
			 	{
				 bSelectAll = false;
				 }
		 }//for*/
			var oSelectAllCheckbox = this.getView().byId("idSelectAll");
			oSelectAllCheckbox.setSelected(this._allItemsInTableSelected(aItems));

			//Set selection of sub items, count selected items and active post button
			//var oTable = this.getView().byId("idProductsTable");
			//var oListItem = oEvent.getSource().getParent();
			//var iSelectedTableIndex = oTable.indexOfItem(oListItem);
			var iSelectedTableIndex = this._getSelectedItemInModel(oEvent);
			var iSelectedDocumentItem = aItems[iSelectedTableIndex].DocumentItem;
			var iSelectedItemsCount = 0;
			for (var i = 0; i < aItems.length; i++) {
				if (aItems[i].DocumentItem == iSelectedDocumentItem) {
					aItems[i].Selected = bSelected;
				}
				if (aItems[i].Selected) {
					iSelectedItemsCount++;
				}
			} //for
			if (iSelectedItemsCount > 0) {

				oModel.setProperty("/PostButtonEnabled", true);
				// 	this.setBtnEnabled("postBtn", true); //activate post button
			} else {
				oModel.setProperty("/PostButtonEnabled", false);
				// 	this.setBtnEnabled("postBtn", false); //deactivate post button
			}

			oModel.setProperty("/Items", aItems);
		}, //end handleSelect

		/**
		 * @function handler of changes in input field DeliveredQuantity_Input of table, checks if input equals valid quantity
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */

		handleInputChange: function(oEvent) {
			//delivered quantity adjusted manually
			var oInput = oEvent.getSource();

			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") { //S2 view
				// in S2 view the select property of sub(items) is handled after nav back 
				var oItem = this.getView().getModel("oItem");
				if (this._oQuantFormat.parse(oInput.getValue()) >= 0) {
					oItem.setProperty("/DeliveredQuantity_valueState", sap.ui.core.ValueState.None); //correct state before check
					oItem.setProperty("/DeliveredQuantity_valueStateText", "");
					if (oItem.getProperty("/StorageLocation_input") === "" && oItem.getProperty("/StorageLocationVisible") == true) {
						oItem.setProperty("/StorageLocation_valueState", sap.ui.core.ValueState.Error);
						oItem.setProperty("/StorageLocation_valueStateText", this.getResourceBundle().getText(
							"STORAGELOCATION_VALUE_STATE_TEXT"));
					}

					var bIsConsistent = this._ItemConsistent(oItem.getData());
					oItem.setProperty("/Selected", bIsConsistent);
					oItem.setProperty("/SelectEnabled", bIsConsistent);
					oItem.setProperty("/ApplyButtonEnabled", bIsConsistent); //Footer Button control

				} else { //error state
					oItem.setProperty("/Selected", false);
					oItem.setProperty("/SelectEnabled", false);
					oItem.setProperty("/ApplyButtonEnabled", false); //Footer Button control
					oItem.setProperty("/DeliveredQuantity_valueState", sap.ui.core.ValueState.Error);
					oItem.setProperty("/DeliveredQuantity_valueStateText", this.getResourceBundle().getText(
						"DELIVEREDQUANTITY_VALUE_STATE_TEXT"));
					//oItem.setProperty("/DeliveredQuantity_input",""); //give chance to correct
				}
			} else { //S1 view with table

				// var oTable = this.getView().byId("idProductsTable");
				//var oListItem = oInput.getParent().getParent();
				//var iSelectedTableIndex = oTable.indexOfItem(oListItem);
				var iSelectedTableIndex = this._getSelectedItemInModel(oEvent);
				var oModel = this.getView().getModel("oFrontend");
				//setting selection of cell --> ListItem
				if (this._oQuantFormat.parse(oInput.getValue()) >= 0) {
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/DeliveredQuantity_valueState", sap.ui.core.ValueState.None); //correct state before check
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/DeliveredQuantity_valueStateText", "");

					if (oModel.getProperty("/Items/" + iSelectedTableIndex + "/StorageLocation_input") == "" && oModel.getProperty("/Items/" +
							iSelectedTableIndex + "/StorageLocationVisible") == true) {
						oModel.setProperty("/Items/" + iSelectedTableIndex + "/StorageLocation_valueState", sap.ui.core.ValueState.Error);
						oModel.setProperty("/Items/" + iSelectedTableIndex + "/StorageLocation_valueStateText", this.getResourceBundle()
							.getText("STORAGELOCATION_VALUE_STATE_TEXT"));
					}

					var bIsConsistent = this._ItemConsistent(oModel.getProperty("/Items")[iSelectedTableIndex], oModel.getProperty("/Items"));
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/Selected", bIsConsistent);
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/SelectEnabled", bIsConsistent);

					// take care of subitems
					var aItems = oModel.getProperty("/Items");
					this._setSelectEnabled(aItems[iSelectedTableIndex], aItems);
					//activate post button and check if select all checkbox has to be set after subitems
					aItems = oModel.getProperty("/Items"); //re-read
					this._controlSelectAllAndPostButton(aItems);

				} else { //blank
					//oInput.getParent().getParent().setSelected(false); 
					//oInput.getParent().getParent().setType( sap.m.ListType.Inactive );
					//de-activate checkboxes / check if at least one item is selected otherwise deactivate post button
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/DeliveredQuantity_valueState", sap.ui.core.ValueState.Error);
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/DeliveredQuantity_valueStateText", this.getResourceBundle()
						.getText("DELIVEREDQUANTITY_VALUE_STATE_TEXT"));
					//oModel.setProperty("/Items/"+iSelectedTableIndex+"/DeliveredQuantity_input", ""); //give chance to correct
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/Selected", false);
					oModel.setProperty("/Items/" + iSelectedTableIndex + "/SelectEnabled", false);
					//		    this.getView().byId("idSelectAll").setSelected(false);
					var aItems = oModel.getProperty("/Items");
					// take care of subitems
					this._setSelectEnabled(aItems[iSelectedTableIndex], aItems);
					this._controlSelectAllAndPostButton(aItems);

				}
			}
		}, //end handleInputChange

		/**
		 * @function handler of changes in input field StockType of table/view, adjusts field control
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */

		handleStockTypeChange: function(oEvent) {
			//sControlOfBatchTableField changes
			var sControlOfBatchTableField = oEvent.getSource().getSelectedItem().data("ControlOfBatchTableField");
			var sControlOfReasonCodeTableField = oEvent.getSource().getSelectedItem().data("ControlOfReasonCodeTableField");
			var oItem = {};

			if (this.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S2") { //S2 view
				// in S2 view the select property of sub(items) is handled after nav back 
				oItem = this.getView().getModel("oItem").getData();
				this._evaluateFieldControl("Batch", sControlOfBatchTableField, oItem);
				this._evaluateFieldControl("GoodsMovementReasonCode", sControlOfReasonCodeTableField, oItem);
				this.getView().getModel("oItem").setData(oItem);

			} else { //S1 view with table

				var iSelectedTableIndex = this._getSelectedItemInModel(oEvent);
				var oModel = this.getView().getModel("oFrontend");

				oItem = oModel.getProperty("/Items/" + iSelectedTableIndex);
				this._evaluateFieldControl("Batch", sControlOfBatchTableField, oItem);
				this._evaluateFieldControl("GoodsMovementReasonCode", sControlOfReasonCodeTableField, oItem);
				oModel.setProperty("/Items/" + iSelectedTableIndex, oItem);

			}

			//set Column visibility
			if (oItem.BatchVisible === true) { //1 Batch Visible => column must be visible
				this.getView().getModel("oFrontend").setProperty("/ColumnBatchVisible", true);
			}
		}, //end handleStockTypeChange

		/*
		 * @function handler of changes in input field DocumentDate/PostingDate of header, checks if input equals valid date
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleDateChange: function(oEvent) {
			var sValueState = sap.ui.core.ValueState.None;

			if (oEvent.getParameter("valid") == false || oEvent.getParameters().value == "") {
				sValueState = sap.ui.core.ValueState.Error;
			}

			oEvent.getSource().setValueState(sValueState);

			this._controlSelectAllAndPostButton(); //update post button
		},

		// Formatter changes to upper case
		handleUpperCase: function(oEvent) {
			var sValue = oEvent.getSource().getValue();
			if (sValue) {
				oEvent.getSource().setValue(sValue.toUpperCase());
			}
		},

		/**
		 * @function handler to split items in table (main + subitems)
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleItemSplit: function(oEvent) {
			//var oTable = this.getView().byId("idProductsTable");
			//var oListItem = oEvent.getSource().getParent();
			//var iSelectedTableIndex = oTable.indexOfItem(oListItem);
			var iSelectedTableIndex = this._getSelectedItemInModel(oEvent);
			var oFrontendModel = this.getView().getModel("oFrontend");

			var oModel = oFrontendModel.getData();
			if (oModel.Items[iSelectedTableIndex].SplitButtonIcon === "sap-icon://add") { //add item
				//clone item
				var newItem = JSON.parse(JSON.stringify(oModel.Items[iSelectedTableIndex]));
				newItem.ItemCounter = this._getMaxItemOfDocumentIteminModel(oModel.Items[iSelectedTableIndex].DocumentItem, oFrontendModel);
				newItem.ItemCounter++;
				newItem.SplitEnabled = true;
				newItem.MaterialVisible = false; // hide non relevant fields
				newItem.AccountAssignmentVisible = false; // hide Account Assignment Button
				newItem.PlantVisible = false; //plant only on original item
				newItem.StorageLocationVisible = true; // Storage location on split item
				newItem.StockTypeVisible = true; // Stock Type location on split item
				newItem.DeliveredQuantity_input = 0;
				//newItem.OpenQuantity = null;
				newItem.SplitButtonIcon = "sap-icon://less";
				newItem.SplitButtonText = "";
				oModel.Items.splice(++iSelectedTableIndex, 0, newItem);
				oFrontendModel.setData(oModel);
			} else { //delete item
				oModel.Items.splice(iSelectedTableIndex, 1);
				oFrontendModel.setData(oModel);
			}
		}, //end handleItemSplit

		/**
		 * @function handler to navigate to detail screen
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleDetailPress: function(oEvent) {
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);

			//getting data of pressed table item in order to set model for detail screen
			var oFrontendModel = this.getView().getModel("oFrontend");
			var aItems = oFrontendModel.getProperty("/Items");
			//	var oTable = this.getView().byId("idProductsTable");
			//var sPath = oEvent.getSource().getBindingContext("oFrontend").getPath();
			//var iSelectedTableIndex = parseInt(sPath.substring(7, sPath.length) );
			var iSelectedTableIndex = this._getSelectedItemInModel(oEvent);
			//var iSelectedTableIndex = oTable.indexOfItem(oEvent.getSource());
			//clone line otherwise referencing error
			// var oDetailModel = new sap.ui.model.json.JSONModel(JSON.parse(JSON.stringify(aItems[iSelectedTableIndex]))); //default is two way binding

			// this.oApplicationFacade.setApplicationModel("oItem", oDetailModel);

			oRouter.navTo("subscreen", {
				POItem: iSelectedTableIndex
			}); // route name in component definition

		},

		/**
		 * @function handler to navigate back to first screen with data confirm
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleNavButtonPress: function(oEvent) {
			//	this.oApplicationFacade.setApplicationModel("oItem", this.getView().getModel("oItem")); //needed for transfer back
			//write data back by reference semantics
			var oItemModel = this.getModel("oItem").getData();
			var oFrontendModel = this.getModel("oFrontend");
			var aItems = oFrontendModel.getProperty("/Items");

			//extension
			if (this._aExtendedFields && this._aExtendedFields.length > 0) { //extended fields --> transfer
				var oBoundObject = this.getView().byId("idExtensionForm").getElementBinding().getBoundContext().getObject();
				for (var i = 0; i < this._aExtendedFields.length; i++) {
					if (this._isExtendedField(this._aExtendedFields[i].name) === true) {
						oItemModel[this._aExtendedFields[i].name] = oBoundObject[this._aExtendedFields[i].name];
					}
				}
			}

			if (this._ItemConsistent(oItemModel, aItems)) { //transfer data only, if consistent

				if (aItems) { //transfer detail back to main table
					for (var i = 0; i < aItems.length; i++) {
						if (aItems[i].DocumentItem === oItemModel.DocumentItem && aItems[i].ItemCounter === oItemModel.ItemCounter) {
							aItems[i] = oItemModel;
						}
					}

					oFrontendModel.setProperty("/Items", aItems);
				}
				// Deal with select item an subitems
				this._setSelectEnabled(oItemModel, aItems);
			} //transfer data only, if consistent

			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("fullscreen", {
				abort: "false"
			}, true); //back seems to work alternative use fullscreen

		},

		/**
		 * @function handler to navigate back to first screen with data abort
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleCancelButtonPress: function(oEvent) {
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("fullscreen", {
				abort: "true"
			}, true); //back seems to work alternative use fullscreen

		},

		/**
		 * @function handler to navigate back from first screen, checks data loss
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleNavButtonPressS1: function(oEvent) { //only used by return from intent based navigation

			var that = this;
			var resourceBundle = that.getResourceBundle();
			var ChangeOK = true;

			// Check data loss
			var sCurrentModel = JSON.stringify(this.getView().getModel("oFrontend").getData());
			if (sCurrentModel && this._initialDataLoaded && (this._initialDataLoaded != null)) {

				var sOldModel = JSON.stringify(this._initialDataLoaded);
				if (sOldModel !== sCurrentModel) {
					// Warning for Data Loss
					var ChangeOK = false;
					sap.m.MessageBox.confirm(resourceBundle.getText("MESSAGE_DATA_LOSS"), {
						icon: sap.m.MessageBox.Icon.QUESTION,
						title: resourceBundle.getText("MESSAGE_DATA_LOSS_TITLE"),
						onClose: fnCallbackConfirm,
						styleClass: "sapUiSizeCompact",
						initialFocus: sap.m.MessageBox.Action.CANCEL
					});
				}
			}

			if (ChangeOK == true) {
				window.history.back();
			}
			//local callback
			function fnCallbackConfirm(bResult) {
				if (bResult === true) {
					window.history.back();
				}
			}

		},

		/**
		 * @function handler of route matched event in unified shell navigation
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 * @param oController Controller object supplied by the UI
		 */
		_handleRouteMatched: function(oEvent, oController) {

			if (oController.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S1" && oEvent.getParameters().name ===
				"fullscreen") { //only S1 View
				// write data back

				var sAbort = "true"; //default -> hash change by nav from other app
				sAbort = oEvent.getParameter("arguments").abort;

				if (sAbort === "false") {
					// var oTempModel = oController.oApplicationFacade.getApplicationModel("oItem");
					// var oItemModel = JSON.parse(oTempModel.getJSON());
					var oFrontendModel = oController.getView().getModel("oFrontend");
					var aItems = oFrontendModel.getProperty("/Items");
					// if (aItems) { //transfer detail back to main table
					// 	for (var i = 0; i < aItems.length; i++) {
					// 		if (aItems[i].DocumentItem == oItemModel.DocumentItem && aItems[i].ItemCounter == oItemModel.ItemCounter) {
					// 			aItems[i] = oItemModel;
					// 		}
					// 	}

					// 	oFrontendModel.setProperty("/Items", aItems);

					// Deal with select item an subitems
					//	oController._setSelectEnabled(oItemModel, aItems);

					// deal with post and select all button
					oController._controlSelectAllAndPostButton(aItems); //update buttons

					//} // aItems exists
				} //end of if
			} else { //only S2 view

				if (oController.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S1" && (oEvent.getParameters().name ===
						"fullscreen2" || oEvent.getParameters().name === "fullscreen3")) { //Hash set		
					//nav Event
					var oHashChanger = sap.ui.core.routing.HashChanger.getInstance();
					var sHash = oHashChanger.getHash();
					if (sHash.indexOf("key") > -1) {
						var aKeys = sHash.split("/");
						if (aKeys.length >= 2) {
							var sPurchaseOrderNumber = aKeys[aKeys.length - 1]; //last

							var oPOInput = oController.getView().byId("POInput");
							if (oPOInput.getValue() !== sPurchaseOrderNumber) { //change only if differen PO
								oPOInput.setValue(sPurchaseOrderNumber);
								oPOInput.fireChangeEvent(sPurchaseOrderNumber);

							}
						}
					}

				} else { //hash set --> old
					//AppState
					if (oController.getView().sViewName === "s2p.mm.im.goodsreceipt.purchaseorder.view.S1" && (oEvent.getParameters().name ===
							"fullscreen4")) { //Appstate		
						//nav Event

						// oController._oNavigationService.parseNavigation().done(function(oAppData, oStartupParameters, sNavType) {
						// 	if (oAppData && oAppData.customData && oAppData.customData.Ebeln) {
						// 		if (oController.getView().byId("POInput")) {
						// 			oController.getView().byId("POInput").setValue(oAppData.customData.Ebeln);
						// 		}
						// 		oController._readPO(oAppData.customData.Ebeln, oAppData.customData);

						// 	}
						// });

					} else { //S2
						// S2 used to transfer table line to view
						var oRouter = sap.ui.core.UIComponent.getRouterFor(oController);
						//var oItemModel = oController.oApplicationFacade.getApplicationModel("oItem");
						var oItemLine = oController.getModel("oFrontend").getProperty("/Items/" + oEvent.getParameter("arguments").POItem + "/");
						var oNewItem = new sap.ui.model.json.JSONModel(JSON.parse(JSON.stringify(oItemLine))); //clone line in case of abort
						var oView = oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S2", sap.ui.core.mvc.ViewType.XML);
						oView.setModel(oNewItem, "oItem");
						oView.setModel(oController.getModel("oFrontend"), "oFrontend"); //needed for conistency chec

						if (oController._aExtendedFields && oController._aExtendedFields.length > 0) { //extended fields --> 

							var oDataModel = oController.getOwnerComponent().getModel("oData");

							// 					var oViewModel = this.getModel("objectView"),
							// oDataModel = this.geoControllertModel();
							var sItem = oEvent.getParameter('arguments').POItem;

							oView.byId("idExtensionForm").bindElement({
								path: "/GR4PO_DL_Items(InboundDelivery='" + oController.getModel("oFrontend").getProperty("/Ebeln") +
									"',DeliveryDocumentItem='" + oItemLine.DocumentItem + "',SourceOfGR='" + oController._SourceOfGR + "')"

								// events: {
								// 	change: this._onBindingChange.bind(this),
								// 	dataRequested: function() {
								// 		oDataModel.metadataLoaded().then(function() {
								// 			// Busy indicator on view should only be set if metadata is loaded,
								// 			// otherwise there may be two busy indications next to each other on the
								// 			// screen. This happens because route matched handler already calls '_bindView'
								// 			// while metadata is loaded.
								// 			oViewModel.setProperty("/busy", true);
								// 		});
								// 	// },
								// 	// dataReceived: function() {
								// 	// 	oViewModel.setProperty("/busy", false);
								// 	}
								// }
							});
						}

						// oView.setModel(oRouter.getView("s2p.mm.im.goodsreceipt.purchaseorder.view.S1", sap.ui.core.mvc.ViewType.XML).getModel("oFrontend"),
						// 	"oFrontend"); //needed for conistency check
					}
				}
			}

		},

		/**
		 * @function checks whether all items in table are selected
		 * @param aTableItems optional containing all table items
		 * @return {boolean} true, if all items in table are selected
		 */
		_allItemsInTableSelected: function(aTableItems) {
			//if not supplied get on your own
			var aItems = [];
			if (aTableItems) {
				aItems = aTableItems;
			} else {
				var oModel = this.getView().getModel("oFrontend");
				aItems = oModel.getProperty("/Items");
			}

			//if at least one item is not selected --> deactivate the all checkbox
			var bSelectAll = false;
			if (aItems.length > 0) {
				bSelectAll = true;
				for (var i = 0; i < aItems.length; i++) {
					if ((aItems[i].Selected == false) && (aItems[i].ItemCounter == 0)) {
						bSelectAll = false;
					}
				} //for
			}
			return bSelectAll;

		},

		/**
		 * @function checks whether at least one item in table are selected
		 * @param aTableItems optional containing all table items
		 * @return {boolean} true, if at least one item in table is selected
		 */
		_oneItemsInTableSelected: function(aTableItems) {
			//if not supplied get on your own
			var aItems = [];
			if (aTableItems) {
				aItems = aTableItems;
			} else {
				var oModel = this.getView().getModel("oFrontend");
				aItems = oModel.getProperty("/Items");
			}

			//if at least one item is  selected 
			var bSelectAll = false;
			for (var i = 0; i < aItems.length; i++) {
				if ((aItems[i].Selected == true) && (aItems[i].ItemCounter == 0)) {
					bSelectAll = true;
				}
			} //for

			return bSelectAll;

		},

		/**
		 * @function checks whether at least one item in table is select enabled
		 * @param aTableItems optional containing all table items
		 * @return {boolean} true, if at least one item in table are selected
		 */
		_oneItemsInTableEnabled: function(aTableItems) {
			//if not supplied get on your own
			var aItems = [];
			if (aTableItems) {
				aItems = aTableItems;
			} else {
				var oModel = this.getView().getModel("oFrontend");
				aItems = oModel.getProperty("/Items");
			}

			//if at least one item is  selected 
			var bSelectEnabled = false;
			for (var i = 0; i < aItems.length; i++) {
				if ((aItems[i].SelectEnabled == true) && (aItems[i].ItemCounter == 0)) {
					bSelectEnabled = true;
				}
			} //for

			return bSelectEnabled;

		},

		/**
		 * @function checks whether  item in table plus its subitems is consistent (no field with value state error)
		 * @param aTableItems optional containing all table items
		 * @param oItem Table item to be checked
		 * @return {boolean} true, if item and its subitems is consistent
		 */
		_ItemConsistent: function(oItem, aTableItems) {
			var aItems;
			if (aTableItems) {
				aItems = aTableItems;
			} else {
				var oModel = this.getView().getModel("oFrontend");
				aItems = oModel.getProperty("/Items");
			}

			//internal check function : check one item
			var check = function(oCheckItem) {
				for (var prop in oCheckItem) {
					if ((prop.indexOf("_valueState") > 0) && (prop.indexOf("_valueStateText") < 0)) {
						if ((oCheckItem[prop] != sap.ui.core.ValueState.None) && (oCheckItem[prop] != sap.ui.core.ValueState.Success)) {
							bConsistent = false; //closure!
						}
					}
				} //for
			};

			//check all (sub) items
			var bConsistent = true;
			for (var i = 0; i < aItems.length; i++) {
				if (aItems[i].DocumentItem == oItem.DocumentItem) { //item or subitem
					if (aItems[i].ItemCounter == oItem.ItemCounter) {
						check(oItem); //check item from input
					} else {
						check(aItems[i]); //check item from data
					}

				}
			}
			return bConsistent;
		},

		/**
		 * @function checks whether  Select all Checkbox / Post Button shall be enabled
		 * @param aTableItems optional containing all table items
		 */
		_controlSelectAllAndPostButton: function(aTableItems) {
			//if not supplied get on your own
			var aItems = [];
			var oModel = this.getView().getModel("oFrontend");

			if (aTableItems) {
				aItems = aTableItems;
			} else {
				aItems = oModel.getProperty("/Items");
			}

			if ((oModel.getProperty("/DocumentDate_valueState") == sap.ui.core.ValueState.None) && (oModel.getProperty(
						"/PostingDate_valueState") ==
					sap.ui.core.ValueState.None)) {

				oModel.setProperty("/PostButtonEnabled", this._oneItemsInTableSelected(aItems));
				//  	this.setBtnEnabled("postBtn", this._oneItemsInTableSelected(aItems)); //de/activate post button
			} else { //disable on wrong date
				oModel.setProperty("/PostButtonEnabled", false);
				//  				this.setBtnEnabled("postBtn", false);
			}

			this.getView().byId("idSelectAll").setSelected(this._allItemsInTableSelected(aItems)); //de/activate select all button 
			this.getView().byId("idSelectAll").setEnabled(this._oneItemsInTableEnabled(aItems)); //select all enablement decoupled from frontend to avoid side effects

		},

		/**
		 * @function sets select enabled button of table item and subitems (invisible)
		 * @param aTableItems optional containing all table items
		 * @param oItem Table item to be selected
		 */
		_setSelectEnabled: function(oItem, aTableItems) { //Update Model of subitems for select attributes 
			var aItems;
			var oModel = this.getView().getModel("oFrontend");
			if (aTableItems) {
				aItems = aTableItems;
			} else {
				aItems = oModel.getProperty("/Items");
			}
			for (var i = 0; i < aItems.length; i++) {
				if (aItems[i].DocumentItem == oItem.DocumentItem && (aItems[i].Selected !== oItem.Selected || aItems[i].SelectEnabled !== oItem.SelectEnabled)) {
					oModel.setProperty("/Items/" + i + "/SelectEnabled", oItem.SelectEnabled);
					oModel.setProperty("/Items/" + i + "/Selected", oItem.Selected);
				}
			} //for

		},

		/**
		 * @function returns the selected table item in model
		 * @param oEvent Event object supplied by UI
		 * @return {int} index of the selected item in model
		 */
		_getSelectedItemInModel: function(oEvent) {

			var sPath = oEvent.getSource().getBindingContext("oFrontend").getPath();
			return parseInt(sPath.substring(7, sPath.length));
		},

		/**
		 * @function returns the max index of subitems of a table item
		 * @param {string} sDocumentItem key of the table item = PO item number
		 * @return {int} max index of subitems assigned to sDocumentItem
		 */
		_getMaxItemOfDocumentIteminModel: function(sDocumentItem, oFrontend) {
			var oModel = {};
			if (!oFrontend) {
				oModel = this.getView().getModel("oFrontend");
			} else {
				oModel = oFrontend;
			}

			var aItems = oModel.getProperty("/Items");
			var maxItem = 0;

			for (var i = 0; i < aItems.length; i++) {
				if ((aItems[i].DocumentItem === sDocumentItem) && (aItems[i].ItemCounter > maxItem)) {
					maxItem = aItems[i].ItemCounter;
				}
			}

			return maxItem;
		},

		/**
		 * @function return the inner app state
		 * @private
		 * @return {object} Inner app state as JSON
		 */
		_getInnerAppState: function() {
			var oState = {
				customData: {}
			};

			var oJSONModel = this.getModel("oFrontend").getData();
			//Header
			for (var k = 0; k < this._oNavigationServiceFields.aHeaderFields.length; k++) {
				oState.customData[this._oNavigationServiceFields.aHeaderFields[k]] = oJSONModel[this._oNavigationServiceFields.aHeaderFields[k]];
			}
			//Attachment services
			oState.customData.Temp_Key = this.temp_objectKey;
			//Items
			var Item;
			oState.customData.Items = [];
			for (var i = 0; i < oJSONModel.Items.length; i++) {
				Item = {};
				if (oJSONModel.Items[i].Selected === true) { // post only selected items
					for (var j = 0; j < this._oNavigationServiceFields.aItemFields.length; j++) {
						Item[this._oNavigationServiceFields.aItemFields[j]] = oJSONModel.Items[i][this._oNavigationServiceFields.aItemFields[j]];
					}
					oState.customData.Items.push(Item);
				}
			}

			return oState;
		},

		/**
		 * @function sets the search placeholder text in case of setting changes
		 * @private
		 */
		_setSearchPlaceholderText: function() {
			var sSearchPlaceholder = "";
			//Default
			if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) { //purchase order
				sSearchPlaceholder = this.getResourceBundle().getText("SEARCH_PLACEHOLDER_TEXT_PO");
				if (this._oPersonalizedDataContainer.SelectPO === true && this._oPersonalizedDataContainer.SelectSTO === true) {
					sSearchPlaceholder = this.getResourceBundle().getText("SEARCH_PLACEHOLDER_TEXT_STO_PO");
				} else {
					if (this._oPersonalizedDataContainer.SelectPO === false && this._oPersonalizedDataContainer.SelectSTO === true) {
						sSearchPlaceholder = this.getResourceBundle().getText("SEARCH_PLACEHOLDER_TEXT_STO");
					}
				}
			} else { //Inbound delivery
				sSearchPlaceholder = this.getResourceBundle().getText("SEARCH_PLACEHOLDER_TEXT_DL");
			}

			this.getModel("oFrontend").setProperty("/searchPlaceholderText", sSearchPlaceholder);
		},

		/**
		 * @function  enables the scan button based on personalisation
		 * @private
		 */
		_setScanButtonVisibility: function() {
			if (jQuery.support.touch) {
				this.getModel("oFrontend").setProperty("/ScanButtonVisible", this._oPersonalizedDataContainer.EnableBarcodeScanning);
			} else {
				this.getModel("oFrontend").setProperty("/ScanButtonVisible", false);
			}
		},

		/**
		 * @function evaluates field control information of oData and translates it into boolean values in Json
		 * @param {string} sField name of the field to be controlled in UI
		 * @param {string} sODataControlField name of the field to be controlled in UI
		 * @param {object} oItem Json object will get attributes ala <sField>visible, <sField>mandatory, <sField>enabled, <sField>ValueHelpVisible, <sField>CreateButtonVisible
		 */

		_evaluateFieldControl: function(sField, sODataControlField, oItem) {
			if (sODataControlField.substring(0, 1) === "1") { //Visisble
				oItem[sField + "Visible"] = true;
			} else {
				oItem[sField + "Visible"] = false;
			}
			if (sODataControlField.substring(1, 2) === "1") { //Mandatory
				oItem[sField + "Mandatory"] = true;
			} else {
				oItem[sField + "Mandatory"] = false;
			}
			if (sODataControlField.substring(2, 3) === "1") { //enabled
				oItem[sField + "Enabled"] = true;
			} else {
				oItem[sField + "Enabled"] = false;
			}
			if (sODataControlField.substring(3, 4) === "1") { //ValueHelp
				oItem[sField + "ValueHelpVisible"] = true;
			} else {
				oItem[sField + "ValueHelpVisible"] = false;
			}
			if (sODataControlField.substring(4, 5) === "1") { //CreateFunction
				oItem[sField + "CreateButtonVisible"] = true;
			} else {
				oItem[sField + "CreateButtonVisible"] = false;
			}

		},

		/**
		 * @function checks whether the field is extended or field control
		 * @param {string} sField name of the field to be controlled
		 * @return {boolean} true, field is extended field, false, field is field control
		 **/
		_isExtendedField: function(sFieldname) {
			if (sFieldname.lastIndexOf("_COB") === sFieldname.length - 4) {
				return true;
			} else {
				return false;
			}
		},

		/**
		 * @function View settings such as grouping/sorting
		 * @param oEvent Event object supplied by UI
		 */
		handleViewSettingsDialogButtonPressed: function(oEvent) {
			if (!this._oSettingsDialog) {
				this._oSettingsDialog = sap.ui.xmlfragment("s2p.mm.im.goodsreceipt.purchaseorder.view.settings", this);
				this.getView().addDependent(this._oSettingsDialog);
			}
			// toggle compact style
			//jQuery.sap.syncStyleClass("sapUiSizeCompact", this.getView(), this._oDialog);
			this._oSettingsDialog.open();
		},

		/**
		 * @function View settings Confirm
		 * @param oEvent Event object supplied by UI
		 */
		handleViewSettingsConfirm: function(oEvent) {
			var oView = this.getView();
			var oTable = oView.byId("idProductsTable");

			var mParams = oEvent.getParameters();
			var oBinding = oTable.getBinding("items");

			// apply sorter to binding
			// (grouping comes before sorting)
			var aSorters = [];
			/*if (mParams.groupItem) {
			      var sPath = mParams.groupItem.getKey();
			      var bDescending = mParams.groupDescending;
			      var vGroup = this.mGroupFunctions[sPath];
			      aSorters.push(new sap.ui.model.Sorter(sPath, bDescending, vGroup));
			    }*/
			var sPath = mParams.sortItem.getKey();
			var bDescending = mParams.sortDescending;
			aSorters.push(new sap.ui.model.Sorter(sPath, bDescending));
			if (sPath == "Material" || sPath == "MaterialName") { //ensure that items with splitt stay together
				aSorters.push(new sap.ui.model.Sorter("DocumentItem_int", false));
			}

			aSorters.push(new sap.ui.model.Sorter("ItemCounter", false)); //keep split items together
			oBinding.sort(aSorters);

		},
		/**
		 * @function View settings cancel
		 * @param oEvent Event object supplied by UI
		 */
		handleViewSettingsCancel: function(oEvent) {

		},
		/**
		 * @function handler for post button/ post GR to backend/displays messages/clears all on success
		 */
		handlePost: function() {
			//remove message from previous posting if exist
			if (sap.ui.getCore().getMessageManager().getMessageModel().getData().length > 0) {
				sap.ui.getCore().getMessageManager().removeAllMessages();
			}

			var oModel = this.getView().getModel("oFrontend");
			var oDateOutputFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
				pattern: "yyyy-MM-dd",
				UTC: "true"
			});
			//		var oDateInputFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
			//			pattern : "dd.MM.yyyy"
			//		}); no centrally

			//var oTable = this.getView().byId("idProductsTable");
			//var aSelectedContext = oTable.getSelectedContexts(true);
			var oJSONModel = oModel.getData();
			var oJson = {};
			var aChangeOperations = [];
			oJson.InboundDelivery = "";
			var oDate = oModel.getProperty("/DocumentDate");
			oJson.DocumentDate = oDateOutputFormat.format(this._oDateFormat.parse(oDate)) + "T00:00:00";
			//oJson.DocumentDate = "2014-06-05T00:00:00";
			//oJson.PostingDate =  "2014-06-05T00:00:00";
			oDate = oModel.getProperty("/PostingDate");
			oJson.PostingDate = oDateOutputFormat.format(this._oDateFormat.parse(oDate)) + "T00:00:00";
			oJson.InboundDelivery = oModel.getProperty("/Ebeln");
			oJson.SourceOfGR = this._SourceOfGR;
			oJson.DeliveryDocumentByVendor = oModel.getProperty("/DeliveryDocumentByVendor");
			oJson.MaterialDocumentHeaderText = oModel.getProperty("/MaterialDocumentHeaderText");
			oJson.Temp_Key = this.temp_objectKey;
			oJson.BillOfLading = oModel.getProperty("/BillOfLading");
			oJson.VersionForPrintingSlip = oModel.getProperty("/VersionForPrintingSlip_selectedKey");
			var Item;
			oJson.Header2Items = new Array();
			for (var i = 0; i < oJSONModel.Items.length; i++) {
				Item = {};
				// var oObject =  aSelectedContext[i].getObject();
				Item.Material = oJSONModel.Items[i].Material;

				Item.InboundDelivery = oModel.getProperty("/Ebeln");
				Item.DeliveryDocumentItem = oJSONModel.Items[i].DocumentItem;

				Item.DocumentItemText = oJSONModel.Items[i].DocumentItemText;

				Item.QuantityInEntryUnit = "" + oJSONModel.Items[i].DeliveredQuantity_input; //convert to string
				Item.EntryUnit = oJSONModel.Items[i].DeliveredUnit_input;
				Item.OpenQuantity = oJSONModel.Items[i].OpenQuantity;
				Item.UnitOfMeasure = oJSONModel.Items[i].Unit;
				Item.Plant = oJSONModel.Items[i].Plant;
				Item.StorageLocation = oJSONModel.Items[i].StorageLocation;
				Item.StockType = oJSONModel.Items[i].StockType_selectedKey; //use key not array position
				if (Item.StockType === " ") { //remapping space -> empty
					Item.StockType = "";
				}
				Item.Batch = oJSONModel.Items[i].Batch;

				Item.AcctAssignmentCategory = oJSONModel.Items[i].AcctAssignmentCategory;
				Item.AssetNumber = oJSONModel.Items[i].AssetNumber;
				Item.AssetNumberName = oJSONModel.Items[i].AssetNumberName;
				Item.SubAssetNumber = oJSONModel.Items[i].SubAssetNumber;
				Item.GLAccount = oJSONModel.Items[i].GLAccount;
				Item.GLAccountName = oJSONModel.Items[i].GLAccountName;
				Item.Project = oJSONModel.Items[i].Project;
				Item.ProjectDescription = oJSONModel.Items[i].ProjectDescription;
				if (oJSONModel.Items[i].DeliveryCompleted === true) {
					Item.DeliveryCompleted = "X";
				}

				Item.GoodsMovementReasonCode = oJSONModel.Items[i].GoodsMovementReasonCode_selectedKey;

				//Extension fields per item 
				if (this._aExtendedFields && this._aExtendedFields.length > 0) { //extended fields --> transfer
					for (var k = 0; k < this._aExtendedFields.length; k++) {
						if (this._isExtendedField(this._aExtendedFields[k].name) === true) {
							Item[this._aExtendedFields[k].name] = oJSONModel.Items[i][this._aExtendedFields[k].name];
						}
					}
				}

				if (Item.QuantityInEntryUnit >= 0 && oJSONModel.Items[i].Selected === true) { // post only selected Quanities>= 0
					oJson.Header2Items.push(Item);
				}
			}

			this._toggleBusy(true);
			this.getView().getModel("oData").create("/GR4PO_DL_Headers", oJson, {
				success: jQuery.proxy(this._handlePostSuccess, this),
				error: jQuery.proxy(this._handleOdataError, this)
			});

		},

		/** 
		 *
		 * @function call back on successfull post request
		 * @private
		 * @param {object} oData oData object
		 * @param {object} oResponse Response object
		 */
		_handlePostSuccess: function(oData, oResponse) {
			this._toggleBusy(false);
			var oheader = oResponse.headers["sap-message"];
			var oJson = JSON.parse(oheader);
			if (oJson.code === "MIGO/012") {

				// Initialization the Initial Load String 
				this._initialDataLoaded = null;

				// Use custom dialog instead
				var oPostMessageModel = new sap.ui.model.json.JSONModel();
				var aMessage = decodeURIComponent(oJson.message).split(" ");
				oPostMessageModel.setProperty("/MaterialDocument", aMessage[aMessage.length - 3]); //MaterialDocNumber
				oPostMessageModel.setProperty("/MaterialDocumentYear", aMessage[aMessage.length - 2]); //MaterialDocYear
				oPostMessageModel.setProperty("/MessageText", decodeURIComponent(oJson.message));
				oPostMessageModel.setProperty("/LinkActive", this._isIntentSupported.GoodsReceiptDisplay);
				this._oPostDialog.setModel(oPostMessageModel);
				this._oPostDialog.open();

				//after successful posting the PO item table has to be hidden
				this.getView().getModel("oFrontend").setData(this._getInitFrontend());

				//  	that.setBtnEnabled("postBtn", false); //deactivate post button --> init Frontend
				this._ResetStorageLocationBuffer = true; //reset Storage Location buffer
				this._ResetBatchBuffer = true; //reset Batch Buffer
				this.getView().byId("idProductsTable").getBinding("items").filter([]); // clear any table filters
				this.getView().byId("idSelectAll").setSelected(false);
				this.getView().byId("idTableSearch").setValue("");
				this.getView().byId("POInput").setValue(""); //reset input field
				this.getView().byId("POInput").setEditable(true); //in case of call by PO Number

				/*code for Attachments*/
				if (this.oCompAttachProj) {
					this.oCompAttachProj.destroy(true);
					delete this.oCompAttachProj;
				}
				//	this.getView().getModel("message").fireMessageChange();

			} else {
				// First set the status 
				if (oJson.code === "MBND_CLOUD/002") {
					var aReturn = [];
					var oReturn = {};
					oReturn.MessageText = oJson.message;
					oReturn.Severity = oJson.severity;
					var aMessage = oJson.target.split(";");
					oReturn.valueState = (aMessage[aMessage.length - 1] + "_valueState");
					oReturn.valueStateText = (aMessage[aMessage.length - 1] + "_valueStateText");
					oReturn.DocumentItem = aMessage[aMessage.length - 2];
					aReturn.push(oReturn);
					for (var i = 0; i < oJson.details.length; i++) {
						oReturn = {};
						oReturn.MessageText = oJson.details[i].message;
						oReturn.Severity = oJson.details[i].severity;
						var aMessage = oJson.details[i].target.split(";");
						oReturn.valueState = (aMessage[aMessage.length - 1] + "_valueState");
						oReturn.valueStateText = (aMessage[aMessage.length - 1] + "_valueStateText");
						oReturn.DocumentItem = aMessage[aMessage.length - 2];
						aReturn.push(oReturn);
					}

					this._SetStatus(aReturn, this.getView().getModel("oFrontend"), oData);
				}
				this.getView().getModel("message").fireMessageChange();

			}

		},

		// 		/**
		// 		 * @function sets the local hash to the key of selected PO before navigation
		// 		 */
		// 		_setLocalHash: function() { //sets the local hash for Nav Back event from called app
		// 			var oHashChanger = sap.ui.core.routing.HashChanger.getInstance();
		// 			var sHash = oHashChanger.getHash();
		// 			if (sHash.indexOf("key/") == -1) {
		// 				sHash += "key/" + this.getView().getModel("oFrontend").getProperty("/Ebeln");
		// 				oHashChanger.setHash(sHash);
		// 			}
		// 		},

		/**
		 * @function sets the value/state selection properties of all table items with issues after posting failure
		 * @param {array} aReturn Array of Document items with issue after posting
		 * @param {oFrontend} optional oFrontend model
		 * @param {oData} reference to ODATA response
		 */
		_SetStatus: function(aReturn, oFrontend, oData) {
			var oFrontendModel = {};

			if (!oFrontend) {
				oFrontendModel = this.getView().getModel("oFrontend");
			} else {
				oFrontendModel = oFrontend;
			}

			var aItems = oFrontendModel.getProperty("/Items");
			//var aItems = oFrontendModel.Items;

			for (var i = 0; i < aReturn.length; i++) {
				for (var y = 0; y < aItems.length; y++) {
					if (aReturn[i].DocumentItem == aItems[y].DocumentItem) {
						// Set the Item on inactive
						if (aReturn[i].valueState == "DocumentItem_valueState") {
							aItems[y].Selected = false;
							aItems[y].SelectEnabled = false;
							aItems[y].ItemEnabled = false;
							aItems[y].SplitEnabled = false;
						} else {
							// Set the Warning on Quntity and Unit 	
							aItems[y][aReturn[i].valueState] = sap.ui.core.ValueState.Warning;
							aItems[y][aReturn[i].valueStateText] = aReturn[i].MessageText;
							for (var z = 0; z < oData.Header2Items.results.length; z++) {
								if (aItems[y].DocumentItem == oData.Header2Items.results[z].DeliveryDocumentItem) {
									aItems[y].Unit = oData.Header2Items.results[z].UnitOfMeasure;
									aItems[y].OpenQuantity = oData.Header2Items.results[z].OpenQuantity;
									if (aItems[y].ItemCounter == 0) {
										aItems[y].DeliveredQuantity_input = oData.Header2Items.results[z].QuantityInEntryUnit;
									} else {
										aItems[y].DeliveredQuantity_input = 0;
									}
									aItems[y].DeliveredUnit_input = oData.Header2Items.results[z].EntryUnit;
								}
							}
						}
					}
				}
			}
			oFrontendModel.setProperty("/Items", aItems);
		},

		/**
		 * @function handler for close event after successfull post
		 * @param oEvent Event object supplied by UI
		 */
		handlePostCloseButton: function(oEvent) {
			this._oPostDialog.close();
		},

		/**
		 * @function handler for navigation to created GR after successfull post
		 * @param oEvent Event object supplied by UI
		 */
		handleFactSheetLinkPress: function(oEvent) { //Navigation to MaterialDocument
			var oModel = oEvent.getSource().getModel();
			var sMaterialDocument = oModel.getProperty("/MaterialDocument");
			var sMaterialDocumentYear = oModel.getProperty("/MaterialDocumentYear");
			var oCrossAppNavigator = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService("CrossApplicationNavigation");
			oCrossAppNavigator.toExternal({
				target: {
					semanticObject: "MaterialMovement",
					action: "displayFactSheet"
				},
				params: {
					MaterialDocument: sMaterialDocument,
					MaterialDocumentYear: sMaterialDocumentYear
				}
			});

			/*	var oParams = {
					MaterialDocument: oModel.getProperty("/MaterialDocument"),
					MaterialDocumentYear: oModel.getProperty("/MaterialDocumentYear")
				};

				// var oState = {
				// 	customData: {}
				// };
			//	oState.customData.InboundDelivery = this.getModel("oFrontend").getProperty("/Ebeln");

				this._oNavigationService.navigate("MaterialMovement", "displayFactSheet", oParams);*/

		},

		/**
		 * @function handler for navigation to Material FactSheet of table items/checks data loss
		 * @param oEvent Event object supplied by UI
		 */
		handleDisplayMaterialLinkPress: function(oEvent) {
			var sMaterial = oEvent.getSource().data("Material"); //store here to avoid side effect in eventing chain
			this._nav2Material(sMaterial);
		},

		/**
		 * @function handler for navigation to Supplier FactSheet of table header/checks data loss
		 * @param oEvent Event object supplied by UI
		 */
		handleDisplaySupplierLinkPress: function(oEvent) { //Navigation to Supplier
			var oFrontendModel = this.getView().getModel("oFrontend");
			this._nav2Supplier(oFrontendModel.getProperty("/Lifnr"));
		},

		/**
		 * @function handler for navigation to Purchase Order FactSheet of table header/checks data loss
		 * @param oEvent Event object supplied by UI
		 */
		handleDisplayPurchaseOrderLinkPress: function(oEvent) { //Navigation to PurchaseOrder
			var oFrontendModel = this.getView().getModel("oFrontend");
			this._nav2PurchaseOrderOrInboundDelivery(oFrontendModel.getProperty("/Ebeln"));
		},

		/**
		 * @function Barcode Scanner Button
		 * @param {sap.ui.base.Event} oEvent Event object supplied by the UI
		 */
		handleScanSuccess: function(oEvent) {
			if (oEvent.getParameters().cancelled === false && oEvent.getParameters().text !== "" &&
				jQuery.isNumeric(oEvent.getParameters().text) === true) {
				var oPOInput = this.getView().byId("POInput");
				oPOInput.setValue(oEvent.getParameters().text);
				oPOInput.fireChangeEvent(oEvent.getParameters().text);
			}
		},

		/**
		 * @function handler for all input such as SuggestionsItemSelected and direct enter in Purchase Order field/checks data loss
		 * @param {sap.ui.base.Event} oEvent Event object supplied by UI
		 */
		handleInputChangeEvent: function(oEvent) { //used for paste into input field
			var sSelectedItemText = oEvent.getParameters().value;
			var that = this;
			var resourceBundle = that.getResourceBundle();
			var ChangeOK = true;

			var aMaxLength = this.getView().getModel("oFrontend").getProperty("/Ebeln_possibleLength");

			// Check data loss
			var sCurrentModel = JSON.stringify(this.getView().getModel("oFrontend").getData());
			if (sCurrentModel && this._initialDataLoaded && (this._initialDataLoaded != null)) {

				var sOldModel = JSON.stringify(this._initialDataLoaded);
				if (sOldModel !== sCurrentModel) {
					// Warning for Data Loss
					var ChangeOK = false;
					sap.m.MessageBox.confirm(resourceBundle.getText("MESSAGE_DATA_LOSS"), {
						icon: sap.m.MessageBox.Icon.QUESTION,
						title: resourceBundle.getText("MESSAGE_DATA_LOSS_TITLE"),
						onClose: fnCallbackConfirm,
						styleClass: "sapUiSizeCompact",
						initialFocus: sap.m.MessageBox.Action.CANCEL
					});
				}
			}

			if (ChangeOK === true) {

				if (aMaxLength.indexOf(sSelectedItemText.length) !== -1 && jQuery.isNumeric(
						sSelectedItemText) === true) {
					this._readPO(sSelectedItemText); //read data
				} else {
					this._toggleBusy(false);
					this.getView().byId("POInput").fireSuggest({
						suggestedValue: sSelectedItemText
					}); //start suggestion
				}

				/*destroy old attachment service instance*/
				if (this.oCompAttachProj) {
					this.oCompAttachProj.destroy(true);
					delete this.oCompAttachProj;
				}

			}
			//local callback
			function fnCallbackConfirm(bResult) {
				//		    if (bResult === true){
				if (bResult === "OK") {
					//	that._readPO(sSelectedItemText);
					if (that.oCompAttachProj) {
						that.oCompAttachProj.destroy(true);
						delete that.oCompAttachProj;
					}

					// trigger reload
					if (aMaxLength.indexOf(sSelectedItemText.length) !== -1 && jQuery.isNumeric(
							sSelectedItemText) === true) {
						that._readPO(sSelectedItemText); //read data
					} else {
						that._toggleBusy(false);
						that.getView().byId("POInput").fireSuggest({
							suggestedValue: sSelectedItemText
						}); //start suggestion
					}

				} else {
					var oPOInput = that.getView().byId("POInput");
					oPOInput.setValue(that._initialDataLoaded.Ebeln);
				}
			}
		},

		/**
		 * @function navigates to Material FactSheet
		 * @param {string}  sMaterial key for navigation
		 */
		_nav2Material: function(sMaterial) {
			var oParams = {
				Material: sMaterial
			};

			// clear Hash 
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.stop();
			var oHashChanger = sap.ui.core.routing.HashChanger.getInstance();
			oHashChanger.setHash("");

			this._oNavigationService.navigate("Material", "displayFactSheet", oParams, this._getInnerAppState());
		},
		/**
		 * @function navigates to Supplier FactSheet
		 * @param {string}  sLifnr key for navigation
		 */
		_nav2Supplier: function(sLifnr) {
			var oParams = {
				Supplier: sLifnr
			};
			// clear Hash 
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.stop();
			var oHashChanger = sap.ui.core.routing.HashChanger.getInstance();
			oHashChanger.setHash("");

			this._oNavigationService.navigate("Supplier", "displayFactSheet", oParams, this._getInnerAppState());
		},

		/**
		 * @function navigates to PurchaseOrder/InboundDelivery FactSheet
		 * @param {string}  sEbeln key for navigation
		 */
		_nav2PurchaseOrderOrInboundDelivery: function(sEbeln) {

			var sSemanticObject = "";
			var oParams = {};
			if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
				sSemanticObject = "PurchaseOrder";
				oParams = {
					PurchaseOrder: sEbeln
				};
			} else {
				sSemanticObject = "InboundDelivery";
				oParams = {
					InboundDelivery: sEbeln
				};
			}

			// clear Hash 
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.stop();
			var oHashChanger = sap.ui.core.routing.HashChanger.getInstance();
			oHashChanger.setHash("");

			this._oNavigationService.navigate(sSemanticObject, "displayFactSheet", oParams, this._getInnerAppState());
		},

		/**
		 * @function reads Purchase Order from backend and creates new oFrontend model with read data/resets filters/sorting/sets App Footer/Header
		 * @param {string}  sPOnumber key of Purchase Order
		 * @param {object}  oAppState optional may contain appstate when navigating back
		 */
		_readPO: function(sPOnumber, oAppState) {
			var that = this;
			//			var oFilter = {};
			var aFilters = [];

			// var resourceBundle = that.getResourceBundle();
			// var oStockTypes = {}; //stock types domain fixed values
			if (sPOnumber) {
				if (sap.ui.getCore().getMessageManager().getMessageModel().getData().length > 0) {
					sap.ui.getCore().getMessageManager().removeAllMessages();
				}
				if (this._SourceOfGR === this._SourceOfGRIsInboundDelivery) {
					sPOnumber = "0" + sPOnumber;
				}

				aFilters.push(new sap.ui.model.Filter("SourceOfGR", sap.ui.model.FilterOperator.EQ, this._SourceOfGR));
				aFilters.push(new sap.ui.model.Filter("InboundDelivery", sap.ui.model.FilterOperator.EQ, sPOnumber));

				//	oFilter = new sap.ui.model.Filter(aFilters, true);

				this._toggleBusy(true);

				this.getOwnerComponent().getModel("oData").read("/GR4PO_DL_Headers", {
					urlParameters: {
						$expand: "Header2Items,Header2Items/Item2StockTypes"
					},
					filters: aFilters,
					success: jQuery.proxy(this._successPOLoad, this, oAppState),
					error: jQuery.proxy(this._handleOdataError, this)

				});

				// this.getOwnerComponent().getModel("oData").read("/GR4PO_DL_Headers('" + sPOnumber + "')", {
				// 	urlParameters: {
				// 		$expand: "Header2Items,Header2Items/Item2StockTypes"
				// 	},
				// 	success: jQuery.proxy(this._successPOLoad, this, oAppState),
				// 	error: jQuery.proxy(this._handleOdataError, this)

				// });

			} //selected item

		},

		/**
		 * @function called after successful load of the PO
		 * @param {Object} oData result set of the request
		 * @param {Object} oResponse response of the request
		 */
		_successPOLoad: function(oAppState, oData, oResponse) {
			// Check header for backend system errors
			var bAbort = false;
			var oHeader = oResponse.headers["sap-message"];
			if (oHeader) {
				var oJson = JSON.parse(oHeader);
				if (oJson.code && oJson.severity === "error") {
					bAbort = true;
					this.getView().byId("POInput")._lastValue = "";
				}
			}
			//Nothing selected
			if (oData.results.length === 0) {
				bAbort = true;
				this.getView().byId("POInput")._lastValue = "";
			}

			if (bAbort === false) { //no error --> continue
				var oModel = this.getView().getModel("oFrontend");
				var bStockTypeCustomizingError = false; //true, if no stock type selection is possible

				//Document header
				var sJson = {};
				sJson.maxFractionDigits = "3";
				sJson.visible = true; //table and header become visible
				sJson.personalizationEnabled = true; // used to control personalisation during posting
				sJson.SupplierDisplayActive = this._isIntentSupported.SupplierDisplay;
				sJson.PurchaseOrderDisplayActive = this._isIntentSupported.PurchaseOrderDisplay;
				sJson.CreateBatchActive = this._isIntentSupported.BatchCreate;
				sJson.MaterialDisplayActive = this._isIntentSupported.MaterialDisplay;
				sJson.VersionForPrintingSlip = this._aVersionForPrintingSlip;
				sJson.VersionForPrintingSlip_selectedKey = "0";

				this._iTableRowsCount = oData.results[0].Header2Items.results.length;
				sJson.POItemsCountTableHeader = this.getResourceBundle().getText("TABLE_ITEMS_LABEL", [this._iTableRowsCount, this._iTableRowsCount]);
				sJson.Lifname = oData.results[0].VendorName;
				sJson.Lifnr = oData.results[0].Vendor;
				sJson.Ebeln = oData.results[0].InboundDelivery;
				sJson.DocumentDate = this._oDateFormat.format(oData.results[0].DocumentDate);
				sJson.PostingDate = this._oDateFormat.format(oData.results[0].PostingDate);
				sJson.DocumentDate_valueState = sap.ui.core.ValueState.None;
				sJson.PostingDate_valueState = sap.ui.core.ValueState.None;
				sJson.DeliveryDocumentByVendor = "";
				sJson.MaterialDocumentHeaderText = "";
				sJson.BillOfLading = "";
				sJson.PurchasingDocumentType = oData.results[0].PurchasingDocumentType;
				sJson.PurchasingDocumentTypeName = oData.results[0].PurchasingDocumentTypeName;
				sJson.SupplyingPlant = oData.results[0].SupplyingPlant;
				sJson.SupplyingPlantName = oData.results[0].SupplyingPlantName;

				//deal with columen visibility  set to false initially an true further down
				sJson.ColumnAccountAssignmentVisible = false;
				sJson.ColumnSplitVisible = false;
				sJson.ColumnPlantVisible = false;
				sJson.ColumnStorageLocationVisible = false;
				sJson.ColumnStockTypeVisible = false;
				sJson.ColumnBatchVisible = false;

				sJson.Items = [];

				for (var i = 0; i < oData.results[0].Header2Items.results.length; i++) {

					var oUnit_input = [];
					oUnit_input[0] = {};
					//oUnit_input[0].key = ""; 
					//oUnit_input[0].text = "";

					//var oStorageLocation_input = new Object();
					//oStorageLocation_input.key = "";
					//oStorageLocation_input.text = "";

					sJson.Items[i] = {};
					sJson.Items[i].ItemCounter = 0; //internal counter used during split
					sJson.Items[i].Selected = false; // Model of select Checkbox
					if (oData.results[0].Header2Items.results[i].OpenQuantity >= 0) {
						sJson.Items[i].SelectEnabled = true;
					} else {
						sJson.Items[i].SelectEnabled = false;
					}

					sJson.Items[i].OpenQuantity_valueState = sap.ui.core.ValueState.None;
					sJson.Items[i].OpenQuantity_valueStateText = "";

					sJson.Items[i].SplitEnabled = true;
					sJson.Items[i].DocumentItem = oData.results[0].Header2Items.results[i].DeliveryDocumentItem;
					sJson.Items[i].DocumentItem_int = parseInt(oData.results[0].Header2Items.results[i].DeliveryDocumentItem); //required for sorting
					sJson.Items[i].Material = oData.results[0].Header2Items.results[i].Material;
					//						sJson.Items[i].Material = resourceBundle.getText("TABLE_COLUMN_MATERIAL_BRACKETS_TEXT",[oData.Header2Items.results[i].Material]);
					sJson.Items[i].MaterialName = oData.results[0].Header2Items.results[i].MaterialName;
					sJson.Items[i].DocumentItemText = oData.results[0].Header2Items.results[i].DocumentItemText;
					sJson.Items[i].PurchaseOrderItemText = oData.results[0].Header2Items.results[i].PurchaseOrderItemText;
					if (sJson.Items[i].PurchaseOrderItemText !== "") { //DocumentItemText of PO is used if filled
						sJson.Items[i].MaterialText = sJson.Items[i].PurchaseOrderItemText;
					} else { // Material short text is used
						sJson.Items[i].MaterialText = sJson.Items[i].MaterialName;
					}

					if (this._oPersonalizedDataContainer.PresetDocumentItemTextFromPO === true) {
						sJson.Items[i].DocumentItemText = sJson.Items[i].PurchaseOrderItemText;
					}

					sJson.Items[i].Unit = oData.results[0].Header2Items.results[i].UnitOfMeasure;
					sJson.Items[i].OpenQuantity = oData.results[0].Header2Items.results[i].OpenQuantity;
					sJson.Items[i].OpenQuantity_number = parseFloat(oData.results[0].Header2Items.results[i].OpenQuantity); //needed internally for sorting
					sJson.Items[i].OrderedQuantity = oData.results[0].Header2Items.results[i].OrderedQuantity;
					sJson.Items[i].OrderedQuantity_number = parseFloat(oData.results[0].Header2Items.results[i].OrderedQuantity);
					sJson.Items[i].OrderedQuantityUnit = oData.results[0].Header2Items.results[i].OrderedQuantityUnit;
					if (oData.results[0].Header2Items.results[i].DeliveryCompleted == "") {
						sJson.Items[i].DeliveryCompleted = false; //normal case
					} else {
						sJson.Items[i].DeliveryCompleted = true; //should not happen due to backed filtering
					}

					// Setting item to enabled 
					if (parseFloat(sJson.Items[i].OpenQuantity) > 0) {
						sJson.Items[i].ItemEnabled = true;
						sJson.Items[i].MaterialVisible = true;
					} else {
						sJson.Items[i].ItemEnabled = false;
						sJson.Items[i].SplitEnabled = false; //splitt button
						sJson.Items[i].MaterialVisible = true;
					}

					sJson.Items[i].SplitButtonIcon = "sap-icon://add";
					//sJson.Items[i].SplitButtonText = "Split";

					if (this._oPersonalizedDataContainer.deliveredQuantityDefault2open === true) {
						sJson.Items[i].DeliveredQuantity_input = parseFloat(oData.results[0].Header2Items.results[i].QuantityInEntryUnit);
					} else {
						sJson.Items[i].DeliveredQuantity_input = parseFloat("0.00");
					}

					sJson.Items[i].DeliveredQuantity_valueState = sap.ui.core.ValueState.None;
					sJson.Items[i].DeliveredQuantity_valueStateText = "";

					//unit fields

					//oUnit_input[0].key = oData.Header2Items.results[i].EntryUnit;
					//oUnit_input[0].text = oData.Header2Items.results[i].EntryUnit;
					//add the additional AUoM to the array of select field
					sJson.Items[i].DeliveredUnit_input = oData.results[0].Header2Items.results[i].EntryUnit;
					sJson.Items[i].DeliveredUnit_valueState = sap.ui.core.ValueState.None;
					sJson.Items[i].DeliveredUnit_valueStateText = "";

					//plant
					sJson.Items[i].Plant_input = oData.results[0].Header2Items.results[i].PlantName;
					sJson.Items[i].Plant = oData.results[0].Header2Items.results[i].Plant;

					//Batch
					sJson.Items[i].Batch = oData.results[0].Header2Items.results[i].Batch;

					//assignment category
					sJson.Items[i].IsConsumptionMovement = oData.results[0].Header2Items.results[i].IsConsumptionMovement;
					sJson.Items[i].AcctAssignmentCategory = oData.results[0].Header2Items.results[i].AcctAssignmentCategory;
					sJson.Items[i].AcctAssignmentCategoryName = oData.results[0].Header2Items.results[i].AcctAssignmentCategoryName;
					if (sJson.Items[i].IsConsumptionMovement === false) { // normal material
						sJson.Items[i].AccountAssignmentVisible = false;
						sJson.Items[i].PlantVisible = true;
						sJson.Items[i].StorageLocationVisible = true;
						sJson.Items[i].StockTypeVisible = true;

						//columns must become visible
						sJson.ColumnSplitVisible = true;
						sJson.ColumnPlantVisible = true;
						sJson.ColumnStorageLocationVisible = true;
						sJson.ColumnStockTypeVisible = true;

					} else { // Project Stock
						sJson.Items[i].AccountAssignmentVisible = true;
						sJson.Items[i].SplitEnabled = false; //never split 
						sJson.Items[i].PlantVisible = false;
						sJson.Items[i].StorageLocationVisible = false;
						sJson.Items[i].StockTypeVisible = false;

						// columns must become visible
						sJson.ColumnAccountAssignmentVisible = true;

					} //check account assignment category

					sJson.Items[i].AssetNumber = oData.results[0].Header2Items.results[i].AssetNumber;
					sJson.Items[i].AssetNumberName = oData.results[0].Header2Items.results[i].AssetNumberName;
					sJson.Items[i].SubAssetNumber = oData.results[0].Header2Items.results[i].SubAssetNumber;
					sJson.Items[i].GLAccount = oData.results[0].Header2Items.results[i].GLAccount;
					sJson.Items[i].GLAccountName = oData.results[0].Header2Items.results[i].GLAccountName;
					sJson.Items[i].Project = oData.results[0].Header2Items.results[i].Project;
					sJson.Items[i].ProjectDescription = oData.results[0].Header2Items.results[i].ProjectDescription;

					//Special Stock types for GR
					sJson.Items[i].InventorySpecialStockType = oData.results[0].Header2Items.results[i].InventorySpecialStockType;
					sJson.Items[i].InventorySpecialStockTypeName = oData.results[0].Header2Items.results[i].InventorySpecialStockTypeName;
					sJson.Items[i].Lifname = oData.results[0].VendorName;
					sJson.Items[i].Lifnr = oData.results[0].Vendor;

					sJson.Items[i].GoodsRecipientName = oData.results[0].Header2Items.results[i].GoodsRecipientName;
					sJson.Items[i].UnloadingPointName = oData.results[0].Header2Items.results[i].UnloadingPointName;
					sJson.Items[i].FunctionalArea = oData.results[0].Header2Items.results[i].FunctionalArea;
					sJson.Items[i].ProfitCenter = oData.results[0].Header2Items.results[i].ProfitCenter;
					sJson.Items[i].ProfitCenterName = oData.results[0].Header2Items.results[i].ProfitCenterName;
					sJson.Items[i].CostCenter = oData.results[0].Header2Items.results[i].CostCenter;
					sJson.Items[i].CostCenterName = oData.results[0].Header2Items.results[i].CostCenterName;
					sJson.Items[i].SalesOrder = oData.results[0].Header2Items.results[i].SalesOrder;
					sJson.Items[i].SalesOrderItem = oData.results[0].Header2Items.results[i].SalesOrderItem;
					sJson.Items[i].OrderID = oData.results[0].Header2Items.results[i].OrderID;

					//storage location after account assingment since it is needed below
					sJson.Items[i].StorageLocation = oData.results[0].Header2Items.results[i].StorageLocation;
					sJson.Items[i].StorageLocation_input = oData.results[0].Header2Items.results[i].StorageLocationName;

					sJson.Items[i].GoodsMovementReasonCode_selectedKey = oData.results[0].Header2Items.results[i].GoodsMovementReasonCode;

					if (sJson.Items[i].AcctAssignmentCategory === "") { //Normal Material 
						if (sJson.Items[i].StorageLocation === "" && sJson.Items[i].DeliveredQuantity_input > 0) {
							sJson.Items[i].StorageLocation_valueState = sap.ui.core.ValueState.Error;
							sJson.Items[i].StorageLocation_valueStateText = this.getResourceBundle().getText("STORAGELOCATION_VALUE_STATE_TEXT");
						} else {
							sJson.Items[i].StorageLocation_valueState = sap.ui.core.ValueState.None;
							sJson.Items[i].StorageLocation_valueStateText = "";
						}
					} else { //Project stock is ok to have no storage location
						sJson.Items[i].StorageLocation_valueState = sap.ui.core.ValueState.None;
						sJson.Items[i].StorageLocation_valueStateText = "";
					}

					//Storage Location is editable if Purchase Order or Delivery has not Storage location
					if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
						sJson.Items[i].StorageLocationEditable = true;
					} else {
						if (sJson.Items[i].StorageLocation === "") {
							sJson.Items[i].StorageLocationEditable = true;
						} else {
							sJson.Items[i].StorageLocationEditable = false;
						}
					}

					// add stock types as array to select field on screen

					var oStockType_input = new Array(); //Array for select box
					var bSelectedStockTypeInList = false; //indicates that pre-selected stock type is allowed

					// if (oData.Header2Items.results[i].StockTypeName != "") { //StockType from PO allowed --> first item in array
					// 	oStockType_input[0] = new Object();
					// 	oStockType_input[0].key = oData.Header2Items.results[i].StockType;
					// 	oStockType_input[0].text = oData.Header2Items.results[i].StockTypeName;
					// }
					for (var j = 0; j < oData.results[0].Header2Items.results[i].Item2StockTypes.results.length; j++) {
						//	if ( oData.Header2Items.results[i].Item2StockTypes.results[j].StockType !== oData.Header2Items.results[i].StockType) {
						//								oStockType_input[j+1] = new Object();
						//								oStockType_input[j+1].key = oStockTypes.results[j].StockType;
						//								oStockType_input[j+1].text = oStockTypes.results[j].StockTypeName;
						if (oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].StockType === "") {
							oStockType_input.push({
								key: " ",
								text: oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].StockTypeName,
								ControlOfBatchTableField: oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].ControlOfBatchTableField,
								ControlOfReasonCodeTableField: oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].ControlOfReasonCodeTableField
							});
						} else {
							oStockType_input.push({
								key: oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].StockType,
								text: oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].StockTypeName,
								ControlOfBatchTableField: oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].ControlOfBatchTableField,
								ControlOfReasonCodeTableField: oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].ControlOfReasonCodeTableField
							});
						}
						if (oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].StockType === oData.results[0].Header2Items.results[i]
							.StockType) {
							bSelectedStockTypeInList = true;
							//set batch layout if selected_key is in list
							this._evaluateFieldControl("Batch", oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].ControlOfBatchTableField,
								sJson.Items[
									i]);
							// set reason code layout if selected key is in list
							this._evaluateFieldControl("GoodsMovementReasonCode", oData.results[0].Header2Items.results[i].Item2StockTypes.results[j].ControlOfReasonCodeTableField,
								sJson.Items[i]);
						}
						//	}
					} //end for stock types
					sJson.Items[i].StockType_input = oStockType_input;
					if (oData.results[0].Header2Items.results[i].StockTypeName !== "" && bSelectedStockTypeInList === true) { //StockType from PO allowed --> set selected
						sJson.Items[i].StockType_selectedKey = oData.results[0].Header2Items.results[i].StockType;
						if (sJson.Items[i].StockType_selectedKey === "") {
							sJson.Items[i].StockType_selectedKey = " ";
						}
					} else { //-> use first, if possible
						if (oStockType_input.length > 0) {
							sJson.Items[i].StockType_selectedKey = oStockType_input[0].key;
							//set batch layout if selected key is not in list
							this._evaluateFieldControl("Batch", oStockType_input[0].ControlOfBatchTableField, sJson.Items[i]);
							//set GoodsMovementReasonCode layout if selected key is not in list
							this._evaluateFieldControl("GoodsMovementReasonCode", oStockType_input[0].ControlOfReasonCodeTableField, sJson.Items[i]);
						} else {
							sJson.Items[i].StockType_selectedKey = " ";
							bStockTypeCustomizingError = true;
						}

					}
					//Stock Types Enabled if > 0
					if (sJson.Items[i].StockType_input.length > 1) {
						sJson.Items[i].StockTypeEnabled = true;
					} else {
						sJson.Items[i].StockTypeEnabled = false;
					}

					//check for Batch Column Visibility
					if (sJson.Items[i].BatchVisible === true) {
						sJson.ColumnBatchVisible = true;
					}

					//calculate select_enabled
					sJson.Items[i].SelectEnabled = this._ItemConsistent(sJson.Items[i], sJson.Items);
					//Controls also apply button on detailed screen
					sJson.Items[i].ApplyButtonEnabled = sJson.Items[i].SelectEnabled;

					//Text for Detail header			 
					//sJson.Items[i].DetailHeaderText = (resourceBundle.getText("DETAILSCREEN_TITLE") + " " + sJson.Items[i].DocumentItem.replace(/^0+/, ''));
					sJson.Items[i].DetailHeaderText = (this.getResourceBundle().getText("DETAILSCREEN_TITLE") + " " + sJson.Items[i].MaterialName +
						" (" +
						sJson.Items[i].Material + ")");

					//Extension fields per item 
					if (this._aExtendedFields && this._aExtendedFields.length > 0) { //extended fields --> transfer
						for (var k = 0; k < this._aExtendedFields.length; k++) {
							if (this._isExtendedField(this._aExtendedFields[k].name) === true) {
								sJson.Items[i][this._aExtendedFields[k].name] = oData.results[0].Header2Items.results[i][this._aExtendedFields[k].name];
							}
						}
					}

				} //end for items

				//set Object header
				if (sJson.SupplyingPlant !== "") { //supplying plant
					sJson.Objectheader = this.formatter.concatenateNameIdFormatter(sJson.SupplyingPlantName, sJson.SupplyingPlant);
					sJson.SupplierDisplayActive = false; // set link to inactive
				} else { //default
					sJson.Objectheader = sJson.Lifname;
				}

				if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
					sJson.fullscreenTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_PO");
					sJson.shareOnJamTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_PO");
					sJson.searchFieldLabel = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_PO");
					sJson.Ebeln_label = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_PO");
					sJson.Ebeln_maxLength = 10;
				} else {
					sJson.fullscreenTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_DL");
					sJson.shareOnJamTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_DL");
					sJson.searchFieldLabel = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_DL");
					sJson.Ebeln_label = this.getResourceBundle().getText("SEARCH_FIELD_LABEL_DL");
					sJson.Ebeln_maxLength = 9;
				}
				sJson.SourceOfGR = this._SourceOfGR;

				if (this._aExtendedFields.length > 0) { //extended fields --> show facet
					sJson.ExtensionSectionVisible = true;
				} else {
					sJson.ExtensionSectionVisible = false;
				}

				//max Length preservation 
				sJson.Ebeln_possibleLength = this.getView().getModel("oFrontend").getProperty("/Ebeln_possibleLength"); //propagate Possible lengh after loads 
				sJson.maxSuggestionWidth = this.getView().getModel("oFrontend").getProperty("/maxSuggestionWidth"); //propagate Possible lengh after loads 

				//Mix AppState  if available 
				var bOneNotFound = false;
				/*if (oAppState) {
					for (var k = 0; k < this._oNavigationServiceFields.aHeaderFields.length; k++) {
						sJson[this._oNavigationServiceFields.aHeaderFields[k]] = oAppState.customData[this._oNavigationServiceFields.aHeaderFields[k]];

					}
					//Items
					//	var Item;
					var bFoundItem = false;

					var iIndexFound = 0;
					for (var m = 0; m < oAppState.Items.length; m++) { // on all items
						bFoundItem = false;
						iIndexFound = 0;
						while (iIndexFound < sJson.Items.length || bFoundItem === false) {
							if (oAppState.Items[m].DocumentItem === sJson.Items[iIndexFound].DocumentItem) {
								bFoundItem = true;
							}
							iIndexFound++;
						}
						//	Item = {};
						if (bFoundItem === true) { //item exists
							sJson.Items[iIndexFound].Selected = true;
							sJson.Items[iIndexFound].DocumentItemText = oAppState.Items[m].DocumentItemText;
							sJson.Items[iIndexFound].DeliveryCompleted = oAppState.Items[m].DeliveryCompleted;
							sJson.Items[iIndexFound].DeliveredUnit_input = oAppState.Items[m].DeliveredUnit_input;
							sJson.Items[iIndexFound].DeliveredQuantity_input = oAppState.Items[m].DeliveredQuantity_input;
							sJson.Items[iIndexFound].StockType_selectedKey = oAppState.Items[m].StockType_selectedKey;
							sJson.Items[iIndexFound].StorageLocation = oAppState.Items[m].StorageLocation;
							if (sJson.Items[iIndexFound].Plant !== oAppState.Items[m].Plant) {
								sJson.Items[iIndexFound].StorageLocation_valueState = sap.ui.core.ValueState.Warning;
								sJson.Items[iIndexFound].StorageLocation_valueStateText = "";
								sJson.Items[iIndexFound].Selected = false;
							} else {
								if (sJson.Items[iIndexFound].StorageLocation !== "") {
									sJson.Items[iIndexFound].StorageLocation_valueState = sap.ui.core.ValueState.None;
								}
							}
							sJson.Items[iIndexFound].Plant = oAppState.Items[m].Plant;
							if (sJson.Items[iIndexFound].OpenQuantity !== oAppState.Items[m].OpenQuantity ||
								sJson.Items[iIndexFound].Unit !== oAppState.Items[m].Unit) {
								sJson.Items[i].DeliveredQuantity_valueState = sap.ui.core.ValueState.Warning;
								sJson.Items[i].DeliveredQuantity_valueStateText = "";
								sJson.Items[iIndexFound].Selected = false;
							}

						} else { //bFoundItem
							bOneNotFound = true;
						}
					}
				} //Mix AppState  if available*/

				oModel.setData(sJson);
				this._setBookmark(sJson.Ebeln);
				this._setSearchPlaceholderText();
				this._setScanButtonVisibility();
				//co-pilot
				this.getView().bindElement({
					path: "/GR4PO_DL_Headers(InboundDelivery='" + sJson.Ebeln +
						"',SourceOfGR='" + this._SourceOfGR + "')",
					model: "oData"
				});

				// Save Data for following Check	
				this._initialDataLoaded = JSON.parse(JSON.stringify(sJson));

				//New PO was chosen therefore we have to re-set the screen objects (check box, button, ...)
				//determine i18n related variables

				oModel.setProperty("/PostButtonVisible", true);

				var aSorters = []; //initial sorting
				aSorters.push(new sap.ui.model.Sorter("DocumentItem_int", false));
				aSorters.push(new sap.ui.model.Sorter("ItemCounter", false));

				this.getView().byId("idProductsTable").removeSelections(true);
				this.getView().byId("idProductsTable").getBinding("items").filter([]); // clear any table filters
				this.getView().byId("idProductsTable").getBinding("items").sort(aSorters); // allways sort top down
				oModel.updateBindings(true); //needed for reload
				// that.getView().byId("idSelectAll").setSelected(false);
				this.getView().byId("idTableSearch").setValue("");

				this._controlSelectAllAndPostButton();

				this._loadAttachmentComponent();

				//issue with AppState
				if (bOneNotFound === true) {
					MessageToast.show(this.getResourceBundle().getText("MESSAGE_CHANGED_PO"));
				}
				//issue with Customizing
				if (bStockTypeCustomizingError === true) {
					this._toggleBusy(false);
					MessageToast.show(this.getResourceBundle().getText("MESSAGE_CONFIGURATION"));
				}

			} // bAbort === false; Response Header ok
			this._toggleBusy(false);
		}, //success full read

		/**
		 * @function private method for setting bookmarks.
		 * @param {string} sPONumber - Purchase Order
		 */
		_setBookmark: function(sPONumber) {
			var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
			var href_For_start_app_with_PO = "";
			var sSemanticObject = "";
			var oParams = {};
			var sTitle = "";
			if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
				sSemanticObject = "PurchaseOrder";
				oParams = {
					"PurchaseOrder": [sPONumber],
					"SourceOfGR": [this._SourceOfGR]
				};
				sTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_PO");
			} else {
				sSemanticObject = "InboundDelivery";
				oParams = {
					"InboundDelivery": [sPONumber],
					"SourceOfGR": [this._SourceOfGR]
				};
				sTitle = this.getResourceBundle().getText("FULLSCREEN_TITLE_DL");
			}

			href_For_start_app_with_PO = (oCrossAppNavigator && oCrossAppNavigator.hrefForExternal({

				target: {
					semanticObject: sSemanticObject,
					action: "createGR"
				},

				params: oParams

			})) || "";

			var ext_href_For_start_app = ""; //full url for external navigation
			var aUrls = (new URI()).toString().split("#"); //system part

			ext_href_For_start_app = (oCrossAppNavigator && oCrossAppNavigator.hrefForExternal({ //local part

				target: {
					semanticObject: sSemanticObject,
					action: "createGR"
				},

				params: oParams

			}), this.getOwnerComponent()) || "";

			if (aUrls[0]) {
				ext_href_For_start_app = aUrls[0] + href_For_start_app_with_PO;
			}

			this.getView().getModel("oFrontend").setProperty("/saveAsTileTitle", sTitle);
			this.getView().getModel("oFrontend").setProperty("/saveAsTileSubtitle", sPONumber);
			this.getView().getModel("oFrontend").setProperty("/saveAsTileURL", ext_href_For_start_app);
			this.getView().getModel("oFrontend").setProperty("/shareInJamURL", ext_href_For_start_app);
			if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
				this.getView().getModel("oFrontend").setProperty("/shareSendEmailSubject", this.getResourceBundle().getText(
					"EMAIL_SUBJECT_PO", [
						sPONumber
					]));
				this.getView().getModel("oFrontend").setProperty("/shareSendEmailMessage", this.getResourceBundle().getText(
					"EMAIL_BODY_PO", [sPONumber,
						ext_href_For_start_app
					]));

			} else {
				this.getView().getModel("oFrontend").setProperty("/shareSendEmailSubject", this.getResourceBundle().getText(
					"EMAIL_SUBJECT_DL", [
						sPONumber
					]));
				this.getView().getModel("oFrontend").setProperty("/shareSendEmailMessage", this.getResourceBundle().getText(
					"EMAIL_BODY_DL", [sPONumber,
						ext_href_For_start_app
					]));
			};
		}, //_setBookmark

		/**
		 * @function handle checkbox delivery completed
		 * @param oEvent Event object supplied by UI
		 */
		handleSelectDeliveryCompleted: function(oEvent) {
			//Handler for detail screen checkbox for setting item to completed
			var bDeliveryCompleted = oEvent.getParameter("selected");
			var oModel = this.getView().getModel("oItem");
			//oModel.setProperty("/DeliveryCompleted", bDeliveryCompleted );
			if (bDeliveryCompleted) { //if set set also selected for posting
				oModel.setProperty("/Selected", bDeliveryCompleted);
			}

		},

		/**
		 * @function handle personalisation start button press
		 * @param oEvent Event object supplied by UI
		 */
		onPersoButtonPressed: function(oEvent) {
			if (!this._oPersDialog) {
				this._oPersDialog = sap.ui.xmlfragment("s2p.mm.im.goodsreceipt.purchaseorder.view.personalization", this);
				this.getView().addDependent(this._oPersDialog);
			}

			var oPersModel = new sap.ui.model.json.JSONModel();

			oPersModel.setData(JSON.parse(JSON.stringify(this._oPersonalizedDataContainer))); //clone to avoid reference issues
			this._oPersDialog.setModel(oPersModel);
			this._oPersDialog.open();
		},

		/**
		 * @function handle personalisation save button press
		 * @param oEvent Event object supplied by UI
		 */
		handlePersonalizationSave: function(oEvent) {

			var oModel = this._oPersDialog.getModel();
			this._oPersonalizedDataContainer = oModel.getData();

			if (this._oPersonalizer) { //personalizer exists = working in FLP
				var oFrontendModel = this.getView().getModel("oFrontend");
				//disable save button during save
				oFrontendModel.setProperty("/personalizationEnabled", false);
				var oSavePromise = this._oPersonalizer.setPersData(this._oPersonalizedDataContainer).done(function() {
					// before the next save is triggered the last one has to be finished
					//enable save button after save
					oFrontendModel.setProperty("/personalizationEnabled", true);
				}).fail(function() {
					jQuery.sap.log.error("Writing personalization data failed.");
					oFrontendModel.setProperty("/personalizationEnabled", true); //restore save although failure
				});
			} //personalizer exists

			this._oPersDialog.close();
		},

		/**
		 * @function handle personalisation abort button press
		 * @param oEvent Event object supplied by UI
		 */
		handlePersonalizationAbort: function(oEvent) {
			this._oPersDialog.close();

		},

		/**
		 * @function handle app settings button press
		 * @param oEvent Event object supplied by UI
		 */
		_showSettingsDialog: function(oEvent) {
			// application settings dialog fragment
			if (!this._oApplicationSettingsDialog) {

				if (this._SourceOfGR === this._SourceOfGRIsPurchaseOrder) {
					this._oApplicationSettingsDialog = sap.ui.xmlfragment({
						fragmentName: "s2p.mm.im.goodsreceipt.purchaseorder.view.ApplicationSettingsPurchaseOrder",
						type: "XML",
						id: "s2p.mm.im.goodsreceipt.purchaseorder.ApplicationSettings"
					}, this);
				} else {
					this._oApplicationSettingsDialog = sap.ui.xmlfragment({
						fragmentName: "s2p.mm.im.goodsreceipt.purchaseorder.view.ApplicationSettingsInboundDelivery",
						type: "XML",
						id: "s2p.mm.im.goodsreceipt.purchaseorder.ApplicationSettings"
					}, this);
				}

				this.getView().addDependent(this._oApplicationSettingsDialog);
			}
			var oPersModel = new sap.ui.model.json.JSONModel();

			oPersModel.setData(JSON.parse(JSON.stringify(this._oPersonalizedDataContainer))); //clone to avoid reference issues
			this._oApplicationSettingsDialog.setModel(oPersModel);
			this._oApplicationSettingsDialog.open();
		},
		/**
		 * @function handle personalisation save button press
		 * @param oEvent Event object supplied by UI
		 */
		handleApplicationSettingsSave: function(oEvent) {

			var oModel = this._oApplicationSettingsDialog.getModel();
			this._oPersonalizedDataContainer = oModel.getData();

			if (this._oPersonalizer) { //personalizer exists = working in FLP
				var oFrontendModel = this.getView().getModel("oFrontend");
				//disable save button during save
				oFrontendModel.setProperty("/personalizationEnabled", false);
				var oSavePromise = this._oPersonalizer.setPersData(this._oPersonalizedDataContainer).done(function() {
					// before the next save is triggered the last one has to be finished
					//enable save button after save
					oFrontendModel.setProperty("/personalizationEnabled", true);
				}).fail(function() {
					jQuery.sap.log.error("Writing personalization data failed.");
					oFrontendModel.setProperty("/personalizationEnabled", true); //restore save although failure
				});
			} //personalizer exists

			this._setSearchPlaceholderText();
			this._setScanButtonVisibility();
			this._oApplicationSettingsDialog.close();
		},

		/**
		 * @function handle personalisation abort button press
		 * @param oEvent Event object supplied by UI
		 */
		handleApplicationSettingsAbort: function(oEvent) {
			this._oApplicationSettingsDialog.close();

		},

		/**
		 * @function formatter of material puts brackets around input
		 * @param {string} smatid String to be put in brackets
		 * @retrun {string} formatted string
		 */
		matidformatter: function(smatid) {
			if (smatid !== "") {
				smatid = "(" + smatid + ")";
			}
			return smatid;
		},

		/**
		 * @function formatter of sales order/sales order item
		 * @param {string} sSalesOrder String to be put ahead of slash
		 * @param {string} sSalesOrderItem String to be behind slash
		 * @return {string} formatted string
		 */
		soformatter: function(sSalesOrder, sSalesOrderItem) {

			return sSalesOrder + "/" + sSalesOrderItem;
		}

	});
});