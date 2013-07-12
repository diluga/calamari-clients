/*global define*/
'use strict';
define(['jquery', 'underscore', 'backbone', 'helpers/raphael_support', 'templates', 'bootstrap', 'helpers/generate-osds', 'views/application-view', 'models/application-model', 'raphael'], function($, _, Backbone, Rs, JST, bs, Generate, View, Models) {
    var OSDVisualization = Backbone.Marionette.ItemView.extend({
        template: JST['app/scripts/templates/viz.ejs'],
        serializeData: function() {
            return {};
        },
        originX: 0,
        originY: 0,
        step: 40,
        osdCount: 16 * 10,
        timer: null,
        ui: {
            viz: '.viz',
            detail: '.detail tbody'
        },
        events: {
            'click .viz': 'clickHandler'
        },
        initialize: function(options) {
            this.App = options.App;
            this.width = 17 * this.step;
            this.height = 11 * this.step;
            this.w = 720;
            this.h = 520;
            _.bindAll(this);
            this.keyHandler = _.debounce(this.keyHandler, 250, true);
            this.App.vent.on('keyup', this.keyHandler);
        },
        drawGrid: function(deferred) {
            var path = Rs.calcGrid(this.originX, this.originY, this.width, this.height, this.step);
            var path1 = this.r.path('M0,0').attr({
                'stroke-width': 1,
                'stroke': '#5e6a71',
                'opacity': 0.40
            });
            this.drawLegend(this.r, 285, 475);
            this.collection = Generate.osds(this.osdCount);
            var anim = window.Raphael.animation({
                path: path,
                callback: function() {
                    deferred.resolve();
                }
            }, 250);
            path1.animate(anim);
        },
        moveCircle: function(m) {
            var pos = Rs.calcPosition(m.get('index'), this.originX, this.originY, this.width, this.height, this.step);
            this.animateCircleTraversal(this.r, this.originX, this.originY, 8, pos.nx, pos.ny, m);
        },
        calculatePositions: function() {
            this.collection.each(this.moveCircle);
            return $.Deferred().resolve();
        },
        legendCircle: function(r, originX, originY, percent) {
            // Helper method to draw circles for use as legends beneath viz.
            var srctext = ['down', 'up/out', 'up/in'];
            var srcstate = [{
                up: false,
                'in': false
            }, {
                up: true,
                'in': false
            }, {
                up: true,
                'in': true
            }];
            var i = Math.round(1 / percent) - 1;
            var m = new Models.OSDModel(_.extend(srcstate[i], {
                capacity: 1024,
                used: percent * 1024
            }));
            var c = r.circle(originX, originY, 16 * m.getPercentage()).attr({
                fill: m.getColor(),
                stroke: 'none',
                'cursor': 'default',
                opacity: 0
            });
            var aFn = window.Raphael.animation({
                opacity: 1
            }, 250, 'easeOut');
            var text = srctext[i];
            r.text(originX, originY + 23, text).attr({
                'cursor': 'default',
                'font-size': '12px',
                'font-family': 'ApexSansLight'
            });
            return c.animate(aFn);
        },
        drawLegend: function(r, originX, originY) {
            // Calls legend circle to place in viz.
            var xp = originX,
                i;
            for (i = 1; i <= 3; i += 1, xp += 50) {
                this.legendCircle(r, xp, originY, i / 3);
            }
        },
        animateCircleTraversal: function(r, originX, originY, radius, destX, destY, model) {
            var c = r.circle(originX, originY, 20 * model.getPercentage()).attr({
                fill: model.getColor(),
                stroke: 'none'
            });
            c.data('modelid', model.cid);
            var t;
            var aFn = window.Raphael.animation({
                cx: destX,
                cy: originY
            }, 250, 'easeOut', function() {
                c.animate({
                    cx: destX,
                    cy: destY
                }, 333, 'easeIn', function() {
                    t = r.text(destX, destY - 1, model.get('index')).attr({
                        font: '',
                        stroke: '',
                        fill: '',
                        style: ''
                    });
                    t.data('modelid', model.cid);
                });
            });
            model.view = c;
            return c.animate(aFn);
        },
        simulateUsedChanges: function() {
            var maxRed = 2;
            this.collection.each(function(m) {
                var up = true;
                var _in = Math.random();
                _in = _in < 0.95;
                if (!_in && (Math.random() > 0.6) && maxRed > 0) {
                    maxRed -= 1;
                    up = false;
                    //console.log(m.cid + ' setting to down');
                }
                m.set({
                    'up': up,
                    'in': _in
                });
            });
            this.App.vent.trigger('updateTotals');
            this.App.vent.trigger('status:healthwarn');
        },
        resetChanges: function() {
            this.collection.each(function(m) {
                m.set({
                    'up': true,
                    'in': true
                });
            });
            this.App.vent.trigger('updateTotals');
            this.App.vent.trigger('status:healthok');
        },
        startSimulation: function() {
            var self = this;
            this.timer = setTimeout(function() {
                self.simulateUsedChanges();
                self.timer = self.startSimulation();
            }, 3000);
            return this.timer;
        },
        stopSimulation: function() {
            clearTimeout(this.timer);
            this.timer = null;
        },
        render: function() {
            Backbone.Marionette.ItemView.prototype.render.apply(this);
            this.r = window.Raphael(this.ui.viz[0], this.w, this.h);
            this.detailPanel = new View({
                el: this.ui.detail
            });
            var d = $.Deferred();
            var p = $.when(this.drawGrid(d));
            p.then(this.calculatePositions);
            return p;
        },
        keyHandler: function(evt) {
            evt.preventDefault();
            if (!evt.keyCode) {
                return;
            }
            var keyCode = evt.keyCode;
            if (keyCode === 82) {
                this.resetChanges();
                return;
            }
            if (keyCode === 85) {
                this.simulateUsedChanges();
                return;
            }
            if (keyCode === 32) {
                var $spinner = $('.icon-spinner');
                if (this.timer === null) {
                    this.startSimulation();
                    $spinner.closest('i').addClass('.icon-spin').show();
                } else {
                    this.stopSimulation();
                    $spinner.closest('i').removeClass('.icon-spin').hide();
                }
            }
        },
        clickHandler: function(evt) {
            if (evt.target.nodeName === 'tspan' || evt.target.nodeName === 'circle') {
                var x = evt.clientX;
                var y = evt.clientY;
                //console.log(x + ' / ' + y);
                var el = this.r.getElementByPoint(x, y);
                //console.log(el);
                if (el) {
                    var cid = el.data('modelid');
                    //console.log(cid);
                    if (cid) {
                        // ignore circles and tspans without data
                        this.detailPanel.model.set(this.collection.get(cid).attributes);
                    }
                    return;
                }
            }
        }
    });
    return OSDVisualization;
});
