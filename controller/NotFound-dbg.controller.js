/*
 * Copyright (C) 2009-2017 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"s2p/mm/im/goodsreceipt/purchaseorder/controller/BaseController"
], function(BaseController) {
	"use strict";

	return BaseController.extend("s2p.mm.im.goodsreceipt.purchaseorder.controller.NotFound", {

		/**
		 * Navigates to the worklist when the link is pressed
		 * @public
		 */
		onLinkPressed: function() {
			this.getRouter().navTo("fullscreen2");
		}

	});

});