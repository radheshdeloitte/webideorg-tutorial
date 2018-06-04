/*
 * Copyright (C) 2009-2017 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([],function(){"use strict";return{numberUnit:function(v){if(!v){return"";}return parseFloat(v).toFixed(2);},concatenateNameIdFormatter:function(v,V){if(v){if(V){v=v+" ("+V+")";}return v;}else{return null;}}};});
