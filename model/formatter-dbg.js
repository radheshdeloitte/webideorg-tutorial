/*
 * Copyright (C) 2009-2017 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([], function() {
	"use strict";

	return {

		/**
		 * Rounds the number unit value to 2 digits
		 * @public
		 * @param {string} sValue the number string to be rounded
		 * @returns {string} sValue with 2 digits rounded
		 */
		numberUnit: function(sValue) {
			if (!sValue) {
				return "";
			}
			return parseFloat(sValue).toFixed(2);
		},
		// 
		/**
		 * Formatter adds Id with brackets
		 * @public
		 * @param {string} iValueName Value name
// 		 * @returns {string} iValueId ValueID
		 */
		concatenateNameIdFormatter: function(iValueName, iValueId) {
				if (iValueName) {
					if (iValueId) {
						iValueName = iValueName + " (" + iValueId + ")";
					}
					return iValueName;
				} else {
					return null;
				}
			} //End Formatter adds field Id with brackets

	};

});