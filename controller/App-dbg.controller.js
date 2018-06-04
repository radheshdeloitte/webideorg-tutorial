/*
 * Copyright (C) 2009-2017 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
		"s2p/mm/im/goodsreceipt/purchaseorder/controller/BaseController",
		"sap/ui/model/json/JSONModel"
	], function(BaseController, JSONModel) {
		"use strict";

		return BaseController.extend("s2p.mm.im.goodsreceipt.purchaseorder.controller.App", {

			onInit: function() {
				var oViewModel,
					fnSetAppNotBusy,
					iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();

				oViewModel = new JSONModel({
					busy: true,
					delay: 0
				});
				this.setModel(oViewModel, "appView");

				fnSetAppNotBusy = function() {
					oViewModel.setProperty("/busy", false);
					oViewModel.setProperty("/delay", iOriginalBusyDelay);
				};

				this.getOwnerComponent().getModel("oData").metadataLoaded().
				then(fnSetAppNotBusy);

				// apply content density mode to root view
				this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
			}
		});

	}

);