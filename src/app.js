/* 
 * This code handles the menu interaction and dynamics.
 * 
 */


$(document).ready(function(){
    app.init();
});

/* * * From dc utils * * */
dc.pluck = function (n, f) {
	if (!f) {
        return function (d) { return d[n]; };
    }
    return function (d, i) { return f.call(d, d[n], i); };
};

_.extend(app, {
    el: $("main"),
    w: $("main .charts").width() - 100,
	mousedown: 0,
	data: {},
	format: {
		date: d3.time.format('%m/%d/%Y'),
		$dec: d3.format('$,.0f'),
		dec: d3.format(',.0f'),
		mini: d3.format('$s'),
		abbrev: function(_val){
			if(_val.key) _val = _val.key;
			return (_val.replace("Department", "Dept.")).replace("Committee", "Comm.");
		},
		ellipsis: function(_val){ 
			if(_val.key) _val = _val.key;
			return _val.length > 18 ? _val.substr(0, 15) + " . . ." : _val; 
		}
	},
	
    init: function(){
        var self = this,
            $win = $(window);
        
        NProgress.configure({ showSpinner: true });
        NProgress.start();
        
        $('nav').portamento({wrapper: $('#body'), gap: 10})
		$('nav a').on("click", function(e){
			e.preventDefault();
			var section = $(e.target).attr("href");
			var offset = $("" + section).offset().top;
			$('html,body').animate({ scrollTop: offset - 80 }, 800);
			self.setHash(section.substr(1));
		});
		
		self.chartGrids = $('.charts').masonry({
		  	itemSelector: '.chart-block',
		  	columnWidth: '.chart-sizer',
		 	percentPosition: true
		});
		
		document.body.onmousedown = function() { 
		  ++self.mouseDown;
		}
		document.body.onmouseup = function() {
		  --self.mouseDown;
		}
		this.loadData();
    },
    
    loadData: function(){
        var self = this;
        NProgress.inc();
        
		queue()
			//.defer(d3.csv, "clean_data/Ethics-Commission-Public-Disclosures.csv", 
		    .defer(d3.csv, "clean_data/Disclosures-Feb-2016.csv",
				function (d) {
					NProgress.inc();
					var date = new Date(d["Date Filed"]);
					return {
						filer: d.Filer,
						//link: d.View,
						title: d.Title,
						dept: d["Dept/Board"].length ? d["Dept/Board"] : "(none)",
						file_type: d["File Type"],
						file_year: d3.time.year(date),
						week: d3.time.week(date),
						date_filed: date,
						original: d.Original,
						amended: d.Amended
					};
        	})
			//.defer(d3.csv, "clean_data/Contributions-Received-By-Candidates.csv",
		    .defer(d3.csv, "clean_data/Campaign-Contributions-Dec-2015.csv",
				function (d) {
					NProgress.inc();
					var date = new Date(d.Date);
					return {
						cand_name: d["Candidate Name"],
						cand_id: d["Reg No"],
						//cand_name_id: {name: d["Candidate Name"], id: d["Reg No"]},
						cont_type: d["Contributor Type"],
						cont_name: d["Contributor Name"],
						date: date,
						amount: +d.Amount.substr(1).replace(",",""),
						office: d.Office,
						//district: d.District,
						party: d.Party,
						state: d.InOutState === "HI",
						week: d3.time.week(date)
					};
			})
			//.defer(d3.csv, "clean_data/Expenditures-Made-By-Candidates.csv",
		    .defer(d3.csv, "clean_data/Expenditures-by-Candidates-Dec-2015.csv",
				function (d) {
				NProgress.inc();
				var date = new Date(d.Date);
				return {
						cand_name: d["Candidate Name"],
						cand_id: d["Reg No"],
						//vend_type: d["Vendor Type"],
						//vend_name: d["Vendor Name"],
						date: date,
						amount: +d.Amount.substr(1).replace(",",""),
						exp_cat: d["Expenditure Category"],
						office: d.Office,
						//district: d.District,
						party: d.Party,
						//state: d["InOutState"],
						state: d.InOutState === "HI",
						week: d3.time.week(date)
					};  
			})
			.await(allLoaded)
		
		function allLoaded(error, disclosures, contributions, expenditures){
			if(error) console.warn(error);
			NProgress.set(.5);
			
			self.data.contributions = contributions;
			self.data.expenditures = expenditures;
			self.data.disclosures = disclosures;
			
			queue()
				.defer(self.renderContributions, self)
				.defer(self.renderExpenditures, self)
				.defer(self.renderDisclosures, self)
				.awaitAll(allRendered)
		}
		function allRendered(error){
			console.debug("all rendered");
			if(error) console.warn(error);
			NProgress.done();
		}
    },
	
	lineChartDefaults: function(_chart, _color, _container){
		var self = this,
			$chartsContainer = _container.find(".charts");
		
		_chart.width(this.w).height(160)
			.margins({top: 4, right: 10, bottom: 20, left: 55})
			.xUnits(d3.time.years)
			.round(d3.time.week.round)
			.ordinalColors([_color])
			.yAxisPadding("20%")
			.elasticY(true)
			.renderArea(true)
			.interpolate('step')
			//.interpolate('bundle')
			.renderDataPoints(true)
			//.clipPadding(10)
			/*.on("preRender", function(){
				if(self.mousedown === 0) self.showLoading($chartsContainer);
			})
			.on("postRender", function(){
				self.hideLoading($chartsContainer);
			})
			.on("preRedraw", function(){
				if(self.mousedown === 0) self.showLoading($chartsContainer);
			})
			.on("postRedraw", function(){
				self.hideLoading($chartsContainer);
			});*/
		_chart.yAxis().ticks(5).tickFormat(this.format.mini);
	},
	rowChartDefaults: function(_chart, _color, _leftMargin, _tipHtml, _renderlet){
		var self = this;
		
		_chart.width(this.w/3)
			.margins({top: 4, right: 10, bottom: 20, left: _leftMargin})
			.labelOffsetX("-5px")
			.elasticX(true)
			.ordering(function(d){return -d.value})
			.ordinalColors([_color])
            .gap(1)
			.on("renderlet", function(chart){ 
				self.addTooltip(chart, _tipHtml); 
				
				if(_renderlet) _renderlet(chart);
			});
		_chart.xAxis().ticks(4).tickFormat(this.format.mini);
	},
	pieChartDefaults: function(_chart, _color, _tipHtml, _container){
		var self = this,
			$chartsContainer = _container.find(".charts");
		_chart.width(this.w/3).height(200)
			//.slicesCap(4)
			.innerRadius(20)
			.ordinalColors([_color, 'hsl(350, 5%, 45%)'])
			.on("renderlet", function(chart){ self.addTooltip(chart, _tipHtml); })
			.on("preRender", function(){
				if(self.mousedown === 0) self.showLoading($chartsContainer);
			})
			.on("postRender", function(){
				self.hideLoading($chartsContainer);
			})
			.on("preRedraw", function(){
				if(self.mousedown === 0) self.showLoading($chartsContainer);
			})
			.on("postRedraw", function(){
				self.hideLoading($chartsContainer);
			});
	},
	addTooltip: function(_chart, _html){
		$(".d3-tip.c-" + _chart.chartID()).remove();
		
		var tip = d3.tip().attr('class', 'd3-tip c-' + _chart.chartID())
			.html(_html)
			.direction('e')
			.offset([0, 10]);
		_chart.svg().call(tip);

		d3.selectAll(_chart.anchor() + " g.row rect, " + _chart.anchor() + " circle.dot")
			.on('mouseover', tip.show)
			.on('mouseout', tip.hide);
	},
	addVerticalLine: function(_chart, _x, _year, _dir, _color, _label){
		var t = _x.getTime(),
			lineData = [{x: _chart.x()(_x), y: _chart.y().range()[0]}, 
					  	{x: _chart.x()(_x), y: _chart.y().range()[1]}];
			
		var line = d3.svg.line()
			.x(function(d) { return d.x; })
			.y(function(d) { return d.y; })
			.interpolate('linear');
		
		_chart.select("g.t-" + t).remove();
		var group = _chart.select('g.chart-body').append("g").attr("class", "t-" + t);
		group.selectAll('line.line-' + _year).data([_label]).enter()
		  .append('line').attr('class', 'line t-' + t)
			.attr("x1", function(){return _chart.x()(_x); })
			.attr("x2", function(){return _chart.x()(_x); })
			.attr("y1", function(){return _chart.y().range()[0]; })
			.attr("y2", function(){return _chart.y().range()[1]; })
			.attr('stroke', _color)
			.attr('stroke-dasharray', '4, 2')
			.attr('stroke-width', .75)
			.attr('stroke-opacity', 1);
		
		group.selectAll("text.label-" + _year).data([_label]).enter()
		  .append("text").attr("class", 'label t-' + t)
			.attr("x", _chart.x()(_x))
			.attr("y", 0)
			.attr("dx", _dir === "L" ? -4 : 4)
			.attr("dy", 12)
			.attr('fill', _color)
			.attr("text-anchor", _dir === "L" ? "end" : "start")
			.text(function(d){return d;});
	},
	
	setupHiddenChart(_container, _cf, _chartGroup){
		var self = this,
			hiddenChart = dc.rowChart('#' + _chartGroup + '-hidden-chart', _chartGroup),
			hiddenDim = _cf.dimension( function(p) { return p.week; } ),
            hiddenGroup = hiddenDim.group().reduceSum(dc.pluck('amount'));
		
		hiddenChart
			.dimension(hiddenDim).group(hiddenGroup)
			.on("renderlet", function(chart){ 
				var amount = _.reduce(_.pluck(chart.group().all(), "value"), function(a, b){ return a + parseFloat(b); });
				_container.find(".totals .amount").html(self.format.$dec(Math.round(amount)));
				_container.find(".totals .size").html(self.format.dec(chart.dimension().top(1e9).length));
			});
	},
	
    renderContributions: function(self, callback){
        NProgress.inc();
		var color = 'hsl(120, 55%, 45%)',
			tipHtml = function(d) { return self.format.$dec(d.value); },
			$container = $("#contributions");
        
        var dateChart = dc.lineChart('#contrib-date-chart', 'contrib'),
			candChart = dc.rowChart('#contrib-candidate-chart', 'contrib'),
			partyChart = dc.rowChart('#contrib-party-chart', 'contrib'),
			officeChart = dc.rowChart('#contrib-office-chart', 'contrib'),
			ctypeChart = dc.rowChart('#contrib-ctype-chart', 'contrib'),
			cnameChart = dc.rowChart('#contrib-cname-chart', 'contrib'),
			stateChart = dc.pieChart('#contrib-state-chart', 'contrib');
		
        var cf = crossfilter(self.data.contributions),
            all = cf.groupAll();
        
		var weekDim = cf.dimension( function(p) { return p.week; } ),
			amountWeekGroup = weekDim.group().reduceSum(dc.pluck('amount'));
        var candDim = cf.dimension( function(p) { return p.cand_name; } ),
            amountCandGroup = candDim.group().reduceSum(dc.pluck('amount'));
		var partyDim = cf.dimension( function(p) { return p.party; } ),
            amountPartyGroup = partyDim.group().reduceSum(dc.pluck('amount'));
		var officeDim = cf.dimension( function(p) { return p.office; } ),
            amountOfficeGroup = officeDim.group().reduceSum(dc.pluck('amount'));
		var cTypeDim = cf.dimension( function(p) { return p.cont_type; } ),
            amountCtypeGroup = cTypeDim.group().reduceSum(dc.pluck('amount'));
		var cNameDim = cf.dimension( function(p) { return p.cont_name; } ),
            amountCnameGroup = cNameDim.group().reduceSum(dc.pluck('amount'));
		var stateDim = cf.dimension( function(p){ return (p.state ? " IN" : "OUT"); } ),
			stateGroup = stateDim.group().reduceSum(dc.pluck('amount'));
		
		self.setupHiddenChart($container, cf, 'contrib');
		
		dateChart
			.dimension(weekDim).group(amountWeekGroup)
			.x(d3.time.scale().domain([new Date(2006, 8, 1), new Date(2016, 1, 1)]))
			.on("renderlet", function(_chart) {
				self.addVerticalLine(_chart, new Date(2008, 8, 20), 2008, "L", "#999", "Primary"); // primary September 20, 2008
				self.addVerticalLine(_chart, new Date(2008, 10, 4), 2008, "R", "#999", "General Election"); // general November 4, 2008
			
				self.addVerticalLine(_chart, new Date(2010, 8, 18), 2010, "L", "#999", "Primary"); // primary September 18, 2010
				self.addVerticalLine(_chart, new Date(2010, 10, 2), 2010, "R", "#999", "General Election"); // general November 2, 2010
			
				self.addVerticalLine(_chart, new Date(2012, 7, 11), 2012, "L", "#999", "Primary"); // primary August 11, 2012
				self.addVerticalLine(_chart, new Date(2012, 10, 6), 2012, "R", "#999", "General Election"); // general November 6, 2012
				
				self.addVerticalLine(_chart, new Date(2014, 7, 9),  2014, "L", "#999", "Primary"); // primary
				self.addVerticalLine(_chart, new Date(2014, 10, 4), 2014, "R", "#999", "General Election"); // general
			})
		self.lineChartDefaults(dateChart, color, $container);
		dateChart.xAxis().ticks(8);
		dateChart.render();
		
		candChart.height(710)
            //.keyAccessor(function(d) { console.debug(d); return d.key.id; })
			.dimension(candDim).group(amountCandGroup)
			.data(function(group) { return group.top(40); })
			//.label(function(d){ return _.findWhere(self.data.contributions, {cand_id: d.key}).candidate; })
			//.label(function(d){ return d.key.name; });
		self.rowChartDefaults(candChart, color, 110, tipHtml, function(chart){ 
			$(chart.anchor()).parent().find(".size").html(chart.group().size());
			chart.data(function(group) { return group.top(40); })
		});
		
		cnameChart.height(560)
            .dimension(cNameDim).group(amountCnameGroup)
			.data(function(group) { return group.top(30); })
			.title(self.format.key)
		self.rowChartDefaults(cnameChart, color, 110, tipHtml, function(chart){ 
			$(chart.anchor()).parent().find(".size").html(chart.group().size());
			chart.data(function(group) { return group.top(30); })
		});
		
		ctypeChart.height(150)
            .dimension(cTypeDim).group(amountCtypeGroup)
			.label(self.format.abbrev)
		self.rowChartDefaults(ctypeChart, color, 110, tipHtml);
		
		partyChart.height(150)
			.dimension(partyDim).group(amountPartyGroup)
		self.rowChartDefaults(partyChart, color, 110, tipHtml);
		
		officeChart.height(310)
            .dimension(officeDim).group(amountOfficeGroup)
		self.rowChartDefaults(officeChart, color, 110, tipHtml);
		
		stateChart.dimension(stateDim).group(stateGroup)
		self.pieChartDefaults(stateChart, color, tipHtml, $container);
		
		dc.renderAll('contrib');
		callback(null);
    },
    
	renderExpenditures: function(self, callback){
        NProgress.inc();
		var w = $("main .charts").width() - 140,
			color = 'hsl(210, 55%, 45%)',
			tipHtml = function(d) { return self.format.$dec(d.value); },
			$container = $("#expenditures");
        
        var dateChart = dc.lineChart('#expend-date-chart', 'expend'),
			candChart = dc.rowChart('#expend-candidate-chart', 'expend'),
			partyChart = dc.rowChart('#expend-party-chart', 'expend'),
			officeChart = dc.rowChart('#expend-office-chart', 'expend'),
			expcatChart = dc.rowChart('#expend-expcat-chart', 'expend'),
			stateChart = dc.pieChart('#expend-state-chart', 'expend')
		
        var cf = crossfilter(self.data.expenditures),
            all = cf.groupAll();
        
		var weekDim = cf.dimension( function(p) { return p.week; } ),
			amountWeekGroup = weekDim.group().reduceSum(dc.pluck('amount'));
        var candDim = cf.dimension( function(p) { return p.cand_name; } ),
            amountCandGroup = candDim.group().reduceSum(dc.pluck('amount'));
		var partyDim = cf.dimension( function(p) { return p.party; } ),
            amountPartyGroup = partyDim.group().reduceSum(dc.pluck('amount'));
		var officeDim = cf.dimension( function(p) { return p.office; } ),
            amountOfficeGroup = officeDim.group().reduceSum(dc.pluck('amount'));
		var expcatDim = cf.dimension( function(p) { return p.exp_cat; } ),
            amountExpcatGroup = expcatDim.group().reduceSum(dc.pluck('amount'));
		var stateDim = cf.dimension( function(p){ return (p.state ? " IN" : "OUT"); } ),
			stateGroup = stateDim.group().reduceSum(dc.pluck('amount'));
		
		self.setupHiddenChart($container, cf, 'expend');
		
		dateChart
			.dimension(weekDim).group(amountWeekGroup)
			.x(d3.time.scale().domain([new Date(2006, 8, 1), new Date(2016, 1, 1)]))
			.on("renderlet", function(_chart) {
				self.addVerticalLine(_chart, new Date(2008, 8, 20), 2008, "L", "#999", "Primary"); // primary September 20, 2008
				self.addVerticalLine(_chart, new Date(2008, 10, 4), 2008, "R", "#999", "General Election"); // general November 4, 2008
			
				self.addVerticalLine(_chart, new Date(2010, 8, 18), 2010, "L", "#999", "Primary"); // primary September 18, 2010
				self.addVerticalLine(_chart, new Date(2010, 10, 2), 2010, "R", "#999", "General Election"); // general November 2, 2010
			
				self.addVerticalLine(_chart, new Date(2012, 7, 11), 2012, "L", "#999", "Primary"); // primary August 11, 2012
				self.addVerticalLine(_chart, new Date(2012, 10, 6), 2012, "R", "#999", "General Election"); // general November 6, 2012
				
				self.addVerticalLine(_chart, new Date(2014, 7, 9),  2014, "L", "#999", "Primary"); // primary
				self.addVerticalLine(_chart, new Date(2014, 10, 4), 2014, "R", "#999", "General Election"); // general
			});
		self.lineChartDefaults(dateChart, color, $container);
		dateChart.xAxis().ticks(8);
		dateChart.render();
		
		candChart.height(710)
            .dimension(candDim).group(amountCandGroup)
			.data(function(group) { return group.top(40); })
			//.label(function(d){ return _.findWhere(self.data.expenditures, {cand_id: d.key}).candidate; })
		self.rowChartDefaults(candChart, color, 110, tipHtml, function(chart){ 
			var amount = _.reduce(_.pluck(chart.group().all(), "value"), function(a, b){ return a + parseFloat(b); });
			$container.find(".totals .amount").html(self.format.$dec(Math.round(amount)));
			$container.find(".totals .size").html(self.format.dec(chart.dimension().top(1e9).length));

			$(chart.anchor()).parent().find(".size").html(chart.group().size());
			chart.data(function(group) { return group.top(40); })
		});
		
		partyChart.height(150)
			.dimension(partyDim).group(amountPartyGroup)
		self.rowChartDefaults(partyChart, color, 110, tipHtml);
		
		officeChart.height(310)
            .dimension(officeDim).group(amountOfficeGroup)
		self.rowChartDefaults(officeChart, color, 110, tipHtml);
		
		expcatChart.height(440)
            .dimension(expcatDim).group(amountExpcatGroup)
			.label(self.format.ellipsis)
		self.rowChartDefaults(expcatChart, color, 110, tipHtml);
		
		stateChart.dimension(stateDim).group(stateGroup);
		self.pieChartDefaults(stateChart, color, tipHtml, $container);
		
		dc.renderAll('expend');
		callback(null);
    },
	
    renderDisclosures: function(self, callback){
        NProgress.inc();
		var w = $("main .charts").width() - 140,
			color = 'hsl(30, 55%, 45%)',
			tipHtml = function(d) { return self.format.dec(d.value) + " disclosures"; },
			$container = $("#disclosures");
		
        var fileDateChart = dc.lineChart('#disclos-fileDate-chart', 'disclos'),
			filerChart = dc.rowChart('#disclos-filer-chart', 'disclos'),
			//yearChart = dc.rowChart('#disclos-year-chart', 'disclos'),
			typeChart = dc.rowChart('#disclos-type-chart', 'disclos'),
			deptChart = dc.rowChart('#disclos-dept-chart', 'disclos'),
			//origChart = dc.pieChart('#disclos-orig-chart', 'disclos'),
			amendChart = dc.pieChart('#disclos-amend-chart', 'disclos');
		
        var cf = crossfilter(self.data.disclosures),
            all = cf.groupAll();
		
		var filedDim = cf.dimension( function(p) { return p.week; } ),
			filedGroup = filedDim.group().reduceCount();
		var filerDim = cf.dimension( function(p) { return p.filer; } ),
			filerGroup = filerDim.group().reduceCount();
		var deptDim = cf.dimension( function(p) { return p.dept; } ),
            deptGroup = deptDim.group().reduceCount();
		var typeDim = cf.dimension( function(p) { return p.file_type; } ),
            typeGroup = typeDim.group().reduceCount();
		//var origDim = cf.dimension( function(p){ if(p.original === "true"){ return " Y"; }else{ return "N"; }; } ),
        //    origGroup = origDim.group();
		var amendDim = cf.dimension( function(p){ if(p.amended === "true"){ return " Y"; }else{ return "N"; }; } ),
            amendGroup = amendDim.group();
        	
		self.setupHiddenChart($container, cf, 'disclos');
		
		fileDateChart
			.dimension(filedDim).group(filedGroup)
			.x(d3.time.scale().domain([new Date(2011, 6, 1), new Date(2016, 3, 1)]))
			.on("renderlet", function(_chart) {
				//self.addTooltip(_chart, tipHtml);
				self.addVerticalLine(_chart, new Date(2012, 6, 23), 2012, "L", "#d88", "Filing deadline"); // filing July 23, 2012
				self.addVerticalLine(_chart, new Date(2012, 7, 11), 2012, "R", "#999", "Primary"); // primary August 11, 2012
				self.addVerticalLine(_chart, new Date(2012, 10, 6), 2012, "R", "#999", "General Election"); // general November 6, 2012
				
				self.addVerticalLine(_chart, new Date(2014, 6, 18), 2014, "L", "#d88", "Filing deadline"); // filing July 18, 2014.
				self.addVerticalLine(_chart, new Date(2014, 7, 9),  2014, "R", "#999", "Primary"); // primary
				self.addVerticalLine(_chart, new Date(2014, 10, 4), 2014, "R", "#999", "General Election"); // general
			});
		self.lineChartDefaults(fileDateChart, color, $container);
		fileDateChart.xAxis().ticks(5);
		fileDateChart.render();
		
		typeChart.height(120)
			.dimension(typeDim).group(typeGroup)
		self.rowChartDefaults(typeChart, color, 110, tipHtml);
		
		filerChart.height(710)
            .dimension(filerDim).group(filerGroup)
			.data(function(group) { return group.top(40); })
			//.on("renderlet", );
		self.rowChartDefaults(filerChart, color, 150, tipHtml, function(chart){ 
			$container.find(".totals .size").html(self.format.dec(chart.dimension().top(1e9).length));

			$(chart.anchor()).parent().find(".size").html(chart.group().size());
			chart.data(function(group) { return group.top(40); })
		});
		
		deptChart.height(710)
            .dimension(deptDim).group(deptGroup)
			.data(function(group) { return group.top(40); })	
			.label(function(d){ return self.format.ellipsis(self.format.abbrev(d)); })
			
		self.rowChartDefaults(deptChart, color, 110, tipHtml, function(chart){ 
			$(chart.anchor()).parent().find(".size").html(chart.group().size());
			chart.data(function(group) { return group.top(40); })
		});
		
		/*origChart.dimension(origDim).group(origGroup);
		self.pieChartDefaults(origChart, color, tipHtml);*/
		
		amendChart.dimension(amendDim).group(amendGroup);
		self.pieChartDefaults(amendChart, color, tipHtml, $container);
		
		dc.renderAll('disclos');
		callback(null);
    },
    
	showLoading: function(_elem){
		/*$(_elem).isLoading({
			text: "Filtering",
			position: "overlay"
		});*/
	},
	hideLoading: function(_elem){
		//console.debug("hide loading");
		//$(_elem).isLoading( "hide" );
	},
	
	
	/*
    setHash: function(_page){
        window.location.hash = _page;
    },
    getHash: function(){
        var link = window.location.hash.substr(1),
            openParen = link.indexOf('('), closeParen = link.indexOf(')'),
            id = null;
        if(openParen > -1){
            id = link.substr(openParen + 1, closeParen - openParen - 1);
            link = link.substr(0, openParen);
        }
        id = $.isEmptyObject(id) ? false : id;
        return {link: link, id: id};
    },
    loadPage: function(){
        console.info("s:loadPage");
        
        var self = this;
        NProgress.start();
        
        var hash = self.getHash().link;
        this.$el = $("[data-link='" + hash + "'] article");
        
        
        NProgress.done();
        
        $('.app-menu .link').each(function(){
            $(this).removeClass("active");
            if($(this).data("link") === hash.link && !hash.id.length){
                $(this).addClass("active");
            }
        });
        $.get(hash.link + '.html', { "_": $.now() }, function (data) {
            self.el.html(data);
            self.el.fadeIn();
            
            self.loadDataForPage(hash);
        }, 'html');
        
    }
    */
});