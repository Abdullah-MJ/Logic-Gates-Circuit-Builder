document.addEventListener('DOMContentLoaded', function() {
	window.app = AppFactory(Circuit, Wire);

	document.getElementById('importBtn').addEventListener('click', function importClickHandler() {
		var json = window.prompt('Paste JSON and press enter to import - this will reset any current design!');
		if (json) {
			loadProject(json);
		}
	});
	document.getElementById('exportBtn').addEventListener('click', function exportClickHandler() {
		var btn = document.getElementById('exportBtn');
		if (copyTextToClipboard(saveProject())) {
			btn.classList.add('show-copy-msg');
			setTimeout(function() {
				btn.classList.remove('show-copy-msg');
			}, 1000);
		}
	});
});

function AppFactory(Circuit, Wire) {
	var App = {};

	App.stage = new createjs.Stage('circuits-canvas');
	App.stage.mouseMoveOutside = true;
	createjs.Touch.enable(App.stage);
	
	var ctx = App.stage.canvas.getContext('2d');
	var devicePixelRatio = window.devicePixelRatio || 1;
	var backingStoreRatio = ctx.webkitBackingStorePixelRatio ||
													ctx.mozBackingStorePixelRatio ||
													ctx.msBackingStorePixelRatio ||
													ctx.oBackingStorePixelRatio ||
													ctx.backingStorePixelRatio || 1;

	App.scale = devicePixelRatio / backingStoreRatio;
	App.stage.scaleX = App.scale;
	App.stage.scaleY = App.scale;
	App.propagation_delay = 125;

	App.delete_btn = {
		element: document.getElementById('deleteBtn'),
		show: function show() {
			this.element.classList.add('show');
			return this;
		},
		hide: function hide() {
			this.element.classList.remove('show');
			return this;
		},
		active: function active() {
			this.element.classList.add('active');
			return this;
		},
		inactive: function inactive() {
			this.element.classList.remove('active');
			return this;
		}
	};

	App.add_menu = (function menuFactory() {
		var Menu = {};

		Menu.is_open = false;
		Menu.add_btn = document.getElementById('addBtn');
		Menu.add_dropdown = document.getElementById('addDropdown');

		Menu.add_btn.addEventListener('click', function() {
			if (Menu.is_open) {
				Menu.hide();
			}
			else{
				Menu.show();
			}
		});

		Menu.show = function show() {
			this.is_open = true;
			menu_tl.play();
		};

		Menu.hide = function hide() {
			this.is_open = false;
			menu_tl.reverse();
		};

		var btns = [];
		function addMenuBtn(name, factory) {
			var btn = document.createElement('div');
			Menu.add_dropdown.appendChild(btn);
			btn.textContent = name;
			btns.push(btn);

			btn.addEventListener('click', function() {
				var centerX = window.innerWidth / 2;
				var centerY = window.innerHeight / 2;
				factory(centerX - App.wires.x, centerY - App.wires.y);
			});
		}

		addMenuBtn('IN', makeButton);
		addMenuBtn('OUT', makeLight);
		addMenuBtn('NOT', makeNot);
		addMenuBtn('OR', makeOr);
		addMenuBtn('AND', makeAnd);
		addMenuBtn('XOR', makeXor);
		addMenuBtn('NOR', makeNor);
		addMenuBtn('MEM', makeMemory);
		addMenuBtn('TCK', makeTicker);
		addMenuBtn('DLY', makeDelay);

		var menu_tl = new TimelineMax({
			paused: true,
			onStart: function() { Menu.add_dropdown.style.display = 'block'; },
			onReverseComplete: function() { Menu.add_dropdown.style.display = 'none'; }
		});

		menu_tl.staggerFromTo(btns, 0.25, {
			opacity: 0,
			y: -28,
			rotationX: -90,
			scaleX: 0.5,
			scaleY: 0.5
		}, {
			opacity: 1,
			y: 0,
			rotationX: 0,
			scaleX: 1,
			scaleY: 1
		}, 0.025)
		.to(Menu.add_btn, menu_tl.duration(), {
			rotation: 225
		}, 0);

		return Menu;
	})();

	App.needs_update = true;
	createjs.Ticker.addEventListener('tick', handleTick);
	createjs.Ticker.framerate = 60;
	function handleTick(evt) {
		if (App.needs_update) {
			App.stage.update();
			App.needs_update = false;
		}
	}

	App.circuits = new createjs.Container();
	App.wires = new createjs.Container();
	App.stage.addChild(App.wires);
	App.stage.addChild(App.circuits);
	App.new_wire = Wire.new({ globalX: 0, globalY: 0 }, { globalX: 0, globalY: 0 });
	App.startNewWire = function startNewWire(evt) {
		var temp_pt = App.wires.localToGlobal(this.globalX, this.globalY);
		temp_pt.x /= App.scale;
		temp_pt.y /= App.scale;
		App.new_wire.output.globalX = temp_pt.x;
		App.new_wire.output.globalY = temp_pt.y;
		App.new_wire.input.globalX = evt.stageX / App.scale;
		App.new_wire.input.globalY = evt.stageY / App.scale;
		App.new_wire.draw(true);
		App.stage.addChild(App.new_wire.gfx);
	};

	App.dragNewWire = function dragNewWire(evt) {
		App.new_wire.input.globalX = evt.stageX / App.scale;
		App.new_wire.input.globalY = evt.stageY / App.scale;
		App.new_wire.draw(true);
	};

	App.endNewWire = function endNewWire(evt) {
		App.needs_update = true;
		App.stage.removeChild(App.new_wire.gfx);
		var connector;
		var temp_pt = new createjs.Point();
		circuitLoop:
		for (var i = Circuit.active.length - 1; i >= 0; i--) {
			var c = Circuit.active[i];
			if (this.circuit.id !== c.id) {
				inputsLoop:
				for (var n = c.inputs.length - 1; n >= 0; n--) {
					var input_conn = c.inputs[n];
					input_conn.gfx.globalToLocal(evt.stageX, evt.stageY, temp_pt);
					if (input_conn.gfx.hitTest(temp_pt.x, temp_pt.y)) {
						connector = input_conn;
						break circuitLoop;
					}
				}
			}
		}

		if (connector) {
			connector.recycleWires();

			var wire = Wire.new(this, connector);
			this.wires.push(wire);
			connector.wires.push(wire);
			App.wires.addChild(wire.gfx);

			wire.powerChange(this.circuit.has_power);
		}
	};

	var dragging_stage = false;
	var stage_offset = new createjs.Point();
	App.stage.on('stagemousedown', function(evt) {
		if (!evt.relatedTarget) {
			dragging_stage = true;
			App.wires.globalToLocal(evt.rawX, evt.rawY, stage_offset);
		}
	});

	App.stage.on('stagemousemove', function(evt) {
		if (dragging_stage) {
			App.needs_update = true;

			var new_x = (evt.rawX / App.scale) - stage_offset.x;
			var new_y = (evt.rawY / App.scale) - stage_offset.y;
			App.wires.x = new_x;
			App.wires.y = new_y;
			App.circuits.x = new_x;
			App.circuits.y = new_y;
		}
	});

	App.stage.on('stagemouseup', function(evt) {
		if (dragging_stage) dragging_stage = false;
	});

	function resizeStage() {
		var width = window.innerWidth;
		var height = window.innerHeight;
  	App.stage.canvas.width = width * App.scale;
		App.stage.canvas.height = height * App.scale;
		App.needs_update = true;
	}
	
	resizeStage();
	window.addEventListener('resize', resizeStage);

	setTimeout(function() {
		var centerX = window.innerWidth / 2;
		var centerY = window.innerHeight / 2;
		makeButton(centerX - 100, centerY);
		makeLight(centerX + 100, centerY);
	}, 0);

	return App;
}

function makeType(type, x, y, other_info) {
	var c;

	switch (type) {
		case 'button':
			c = makeButton(x, y);
			break;

		case 'light':
			c = makeLight(x, y);
			break;

		case 'not':
			c = makeNot(x, y);
			break;

		case 'or':
			c = makeOr(x, y);
			break;

		case 'and':
			c = makeAnd(x, y);
			break;

		case 'xor':
			c = makeXor(x, y);
			break;

		case 'nor':
			c = makeNor(x, y);
			break;

		case 'memory':
			c = makeMemory(x, y, other_info.memory);
			break;

		case 'ticker':
			c = makeTicker(x, y, other_info.off_time);
			break;

		case 'delay':
			c = makeDelay(x, y, other_info.delay);
			break;

		default:
			throw new Error('makeType: "' + type + '" is not a valid type');
			break;
	}

	return c;
}


function makeButton(x, y) {
	var c = new Circuit('button', 0, 1);
	c.add(x, y);
	var toggle_btn = new createjs.Shape();
	c.gfx.addChild(toggle_btn);
	toggle_btn.on('mousedown', toggleGenerator);
	toggle_btn.on('pressup', toggleGenerator);

	function toggleGenerator() {
		c.has_power = !c.has_power;
		renderButton(c);
		c.broadcastPower();
	}

	function renderButton() {
		var btn_color = c.has_power ? Wire.on_color : Wire.off_color;
		var icon_color = c.has_power ? Wire.off_color : 'white';

		toggle_btn.graphics.clear();
		toggle_btn.graphics.beginFill(btn_color);
		toggle_btn.graphics.drawCircle(0, 0, 18);
		toggle_btn.graphics.setStrokeStyle(2);
		toggle_btn.graphics.beginStroke(icon_color);
		toggle_btn.graphics.drawCircle(0, 0, 10);
		toggle_btn.graphics.beginStroke(icon_color);
		toggle_btn.graphics.moveTo(0, -4);
		toggle_btn.graphics.lineTo(0, 4);
		toggle_btn.graphics.endStroke();
		c.gfx.updateCache();
	}
	renderButton();
	return c;
}

function makeLight(x, y) {
	var c = new Circuit('light', 1, 0);
	c.add(x, y);
	c.determinePowerState = function determinePowerState(inputs) {
		return inputs[0];
	};

	var light_gfx = new createjs.Shape();
	c.draggable.addChild(light_gfx);
	c.powerChanged = renderLight;

	function renderLight() {
		var light_color = c.has_power ? Wire.on_color : Wire.off_color;
		light_gfx.graphics.clear();
		light_gfx.graphics.beginFill(light_color);
		light_gfx.graphics.drawCircle(0, 0, 18);
		c.gfx.updateCache();
	}
	renderLight();
	return c;
}

function makeNot(x, y) {
	var c = new Circuit('not', 1, 1, 'NOT');
	c.add(x, y);
	c.has_power = true;
	c.determinePowerState = function determinePowerState(inputs) {
		return !inputs[0];
	};
	return c;
}

function makeOr(x, y) {
	var c = new Circuit('or', 2, 1, 'OR');
	c.add(x, y);
	c.determinePowerState = function determinePowerState(inputs) {
		return inputs[0] || inputs[1];
	};
	return c;
}

function makeAnd(x, y) {
	var c = new Circuit('and', 2, 1, 'AND');
	c.add(x, y);
	c.determinePowerState = function determinePowerState(inputs) {
		return inputs[0] && inputs[1];
	};
	return c;
}

function makeXor(x, y) {
	var c = new Circuit('xor', 2, 1, 'XOR');
	c.add(x, y);
	c.determinePowerState = function determinePowerState(inputs) {
		return (inputs[0] || inputs[1]) && !(inputs[0] && inputs[1]);
	};
	return c;
}

function makeNor(x, y) {
	var c = new Circuit('nor', 2, 1, 'NOR');
	c.add(x, y);
	c.has_power = true;
	c.determinePowerState = function determinePowerState(inputs) {
		return !inputs[0] && !inputs[1];
	};
	return c;
}

function makeMemory(x, y, state) {
	var c = new Circuit('memory', 2, 1);
	c.add(x, y);
	var memory = c.data.memory = !!state;
	c.determinePowerState = function determinePowerState(inputs) {
		if (inputs[1]) {
			memory = c.data.memory = true;
		}
		else {
			if (inputs[0]) memory = c.data.memory = false;
		}
		return memory;
	};

	var light_gfx = new createjs.Shape();
	c.draggable.addChild(light_gfx);
	c.powerChanged = renderLight;

	function renderLight() {
		var light_color = c.has_power ? Wire.on_color : Wire.off_color;
		light_gfx.graphics.clear();
		light_gfx.graphics.beginFill(light_color);
		light_gfx.graphics.drawCircle(0, 0, 14);
		c.gfx.updateCache();
	}

	var on_lbl = new createjs.Shape();
	var off_lbl = new createjs.Shape();
	on_lbl.x = c.inputs[1].gfx.x + 16;
	on_lbl.y = c.inputs[1].gfx.y;
	off_lbl.x = c.inputs[0].gfx.x + 16;
	off_lbl.y = c.inputs[0].gfx.y;
	c.draggable.addChild(on_lbl);
	c.draggable.addChild(off_lbl);
	on_lbl.graphics.setStrokeStyle(2);
	on_lbl.graphics.beginStroke('white');
	on_lbl.graphics.moveTo(0, -4);
	on_lbl.graphics.lineTo(0, 4);
	on_lbl.graphics.endStroke();
	off_lbl.graphics.setStrokeStyle(2);
	off_lbl.graphics.beginStroke('white');
	off_lbl.graphics.drawCircle(0, 0, 4);

	if (memory) {
		c.inputChange();
	}
	renderLight();
	return c;
}

function makeTicker(x, y, set_off_time) {
	var c = new Circuit('ticker', 0, 1);
	c.add(x, y);
	var toggle_btn = new createjs.Shape();
	c.gfx.addChild(toggle_btn);
	toggle_btn.on('click', toggleGenerator);
	var delay = app.propagation_delay;
	var off_time = c.data.off_time = set_off_time || 10; 
	var on_time = delay;
	setTimeout(toggleGenerator, off_time * delay);

	function toggleGenerator() {
		c.has_power = !c.has_power;
		renderLight(c);
		setTimeout(toggleGenerator, c.has_power ? on_time : off_time * delay);
		c.broadcastPower();
	}

	var light_gfx = new createjs.Shape();
	c.draggable.addChild(light_gfx);

	function renderLight() {
		var light_color = c.has_power ? Wire.on_color : Wire.off_color;
		light_gfx.graphics.clear();
		light_gfx.graphics.beginFill(light_color);
		light_gfx.graphics.drawCircle(0, 0, 18);
		c.gfx.updateCache();
	}
	renderLight();
	var label = new createjs.Text(off_time, '18px Arial', '#FFF');
	label.textAlign = 'center';
	label.cache(-c.chip_radius, 0, c.chip_radius * 2, 20);
	c.draggable.addChild(label);
	label.x = 0;
	label.y = -10;

	function renderLabel() {
		label.text = off_time;
		label.updateCache();
		c.gfx.updateCache();
		app.needs_update = true;
	}

	var up_btn = new createjs.Shape();
	up_btn.y = -28;
	up_btn.graphics.beginFill(Wire.on_color);
	up_btn.graphics.drawPolyStar(0, 0, 8, 3, 0, -90);
	c.gfx.addChild(up_btn);
	var down_btn = new createjs.Shape();
	down_btn.y = 28;
	down_btn.graphics.beginFill(Wire.on_color);
	down_btn.graphics.drawPolyStar(0, 0, 8, 3, 0, 90);
	c.gfx.addChild(down_btn);
	up_btn.on('click', function() {
		off_time++;
		c.data.off_time = off_time;
		renderLabel();
	});

	down_btn.on('click', function() {
		off_time--;
		if (off_time < 1) off_time = 1;
		c.data.off_time = off_time;
		renderLabel();
	});
	c.gfx.updateCache();

	return c;
}

function makeDelay(x, y, delay) {
	var c = new Circuit('delay', 1, 1);
	c.add(x, y);
	c.determinePowerState = function determinePowerState(inputs) {
		return inputs[0];
	};

	if (typeof delay !== 'undefined') c.delay = delay;

	var label = new createjs.Text(c.delay, '18px Arial', '#FFF');
	label.textAlign = 'center';
	label.cache(-c.chip_radius, 0, c.chip_radius * 2, 20);
	c.draggable.addChild(label);
	label.x = 0;
	label.y = -10;

	function renderLabel() {
		label.text = c.delay;
		label.updateCache();
		c.gfx.updateCache();
		app.needs_update = true;
	}

	var up_btn = new createjs.Shape();
	up_btn.y = -22;
	up_btn.graphics.beginFill(Wire.on_color);
	up_btn.graphics.drawPolyStar(0, 0, 8, 3, 0, -90);
	c.gfx.addChild(up_btn);
	var down_btn = new createjs.Shape();
	down_btn.y = 22;
	down_btn.graphics.beginFill(Wire.on_color);
	down_btn.graphics.drawPolyStar(0, 0, 8, 3, 0, 90);
	c.gfx.addChild(down_btn);
	up_btn.on('click', function() {
		c.delay++;
		renderLabel();
	});

	down_btn.on('click', function() {
		c.delay--;
		if (c.delay < 1) c.delay = 1;
		renderLabel();
	});
	c.gfx.updateCache();
	return c;
}

var Circuit = (function CircuitFactory() {
	var next_circuit_id = 0;
	var Circuit = function Circuit(type, inputs, outputs, label) {
		inputs = inputs || 0;
		outputs = outputs || 0;
		this.id = next_circuit_id++;
		this.type = type;
		this.gfx = new createjs.Container();
		this.draggable = new createjs.Container();
		this.draggable.mouseChildren = false;
		this.chip_radius = 40;
		this.chip = new createjs.Shape();
		this.chip.graphics.setStrokeStyle(2);
		this.chip.graphics.beginStroke('#777');
		this.chip.graphics.beginFill('#555');
		this.chip.graphics.drawCircle(0, 0, this.chip_radius);
		this.label = null;
		this.draggable.addChild(this.chip);
		this.gfx.addChild(this.draggable);

		if (label) {
			this.label = new createjs.Text(label, 'bold 14px Arial', '#FFF');
			this.label.textAlign = 'center';
			var label_rect = this.label.getBounds();
			this.label.cache(label_rect.x, label_rect.y, label_rect.width, label_rect.height);
			this.label.x = 0;
			this.label.y = -8;
			this.draggable.addChild(this.label);
		}
		this.has_power = false;
		this.powerChanged;
		this.inputs = [];
		this.outputs = [];
		this.simple_inputs = [];
		this.delay = 1;
		this.data = {};
		this.determinePowerState;
		var angle_space;
		var angle_start;
		angle_space = Math.PI / 6;
		angle_start = -angle_space * (inputs - 1) / 2 - Math.PI / 2;
		for (var i = 0; i < inputs; i++) {
			var current_angle = angle_space * i + angle_start;
			var connector = new Connector('input', this);
			this.inputs.push(connector);
			connector.index = i;
			connector.gfx.x = Math.sin(current_angle) * this.chip_radius;
			connector.gfx.y = -Math.cos(current_angle) * this.chip_radius;
			this.gfx.addChild(connector.gfx);
			this.simple_inputs.push(false);
		}
		angle_space = Math.PI / 6;
		angle_start = -angle_space * (outputs - 1) / 2 + Math.PI / 2;
		for (var i = 0; i < outputs; i++) {
			var current_angle = angle_space * i + angle_start;
			var connector = new Connector('output', this);
			this.outputs.push(connector);
			connector.index = i;
			connector.gfx.x = Math.sin(current_angle) * this.chip_radius;
			connector.gfx.y = -Math.cos(current_angle) * this.chip_radius;
			this.gfx.addChild(connector.gfx);
		}
		this.draggable.on('mousedown', mouseDownHandler, this);
		this.draggable.on('pressmove', pressMoveHandler, this);
		this.draggable.on('pressup', pressUpHandler, this);

		var cache_radius = this.chip_radius + connector_radius + 1;
		this.gfx.cache(-cache_radius, -cache_radius, cache_radius * 2, cache_radius * 2);
	};

	Circuit.findById = function findById(id) {
		for (var i = this.active.length - 1; i >= 0; i--) {
			var c = this.active[i];
			if (c.id === id)
				return c;
		}
		return null;
	};

	Circuit.setNextId = function setNextId(id) {
		next_circuit_id = id;
	};

	Circuit.prototype.setPosition = function setPosition(x, y) {
		var app = window.app;
		app.needs_update = true;
		this.gfx.x = x;
		this.gfx.y = y;

		var temp_pt = new createjs.Point();
		for (var i = 0, len = this.inputs.length; i < len; i++) {
			var connector = this.inputs[i];
			this.gfx.localToLocal(connector.gfx.x, connector.gfx.y, app.wires, temp_pt);
			connector.globalX = temp_pt.x;
			connector.globalY = temp_pt.y;
			for (var n = connector.wires.length - 1; n >= 0; n--) {
				connector.wires[n].draw();
			}
		}
		for (var i = 0, len = this.outputs.length; i < len; i++) {
			var connector = this.outputs[i];
			this.gfx.localToLocal(connector.gfx.x, connector.gfx.y, app.wires, temp_pt);
			connector.globalX = temp_pt.x;
			connector.globalY = temp_pt.y;
			for (var n = connector.wires.length - 1; n >= 0; n--) {
				connector.wires[n].draw();
			}
		}
	};

	Circuit.prototype.inputChange = function inputChange() {

		for (var i = this.inputs.length - 1; i >= 0; i--) {
			var c = this.inputs[i];
			this.simple_inputs[i] = c.wires.length && c.wires[0].has_power;
		}

		var new_power_state = this.determinePowerState(this.simple_inputs);

		if (this.has_power !== new_power_state) {
			this.has_power = new_power_state;
			this.broadcastPower();
		}
	};

	Circuit.prototype.broadcastPower = function broadcastPower() {
		app.needs_update = true;

		if (this.powerChanged) this.powerChanged(this.has_power);

		var delay = app.propagation_delay;
		for (var i = this.outputs.length - 1; i >= 0; i--) {
			var c = this.outputs[i];
			for (var n = c.wires.length - 1; n >= 0; n--) {
				var w = c.wires[n];
				setTimeout(w.powerChange.bind(w, this.has_power), this.delay * delay);
			}
		}
	};

	Circuit.prototype.add = function add(x, y) {
		app.needs_update = true;

		app.circuits.addChild(this.gfx);
		Circuit.active.push(this);
		this.setPosition(x, y);
	};

	Circuit.prototype.remove = function remove() {
		app.needs_update = true;
		app.circuits.removeChild(this.gfx);

		for (var i = Circuit.active.length - 1; i >= 0; i--) {
			var c = Circuit.active[i];
			if (c.id === this.id) {
				Circuit.active.splice(i, 1);
				for (var n = this.inputs.length - 1; n >= 0; n--) {
					this.inputs[n].recycleWires();
				}
				for (var n = this.outputs.length - 1; n >= 0; n--) {
					this.outputs[n].recycleWires();
				}
				break;
			}
		}
	};

	var drag_offset = new createjs.Point();
	var remove_box_size = 50;
	function mouseDownHandler(evt) {
		app.delete_btn.show();
		drag_offset.x = evt.localX;
		drag_offset.y = evt.localY;
	}

	function pressMoveHandler(evt) {
		if (evt.stageX < remove_box_size*app.scale && evt.stageY < remove_box_size*app.scale) {
			app.delete_btn.active();
		}
		else{
			app.delete_btn.inactive();
		}

		this.setPosition(this.gfx.x + evt.localX - drag_offset.x, this.gfx.y + evt.localY - drag_offset.y);
	}

	function pressUpHandler(evt) {
		app.delete_btn.inactive().hide();
		if (evt.stageX < remove_box_size*app.scale && evt.stageY < remove_box_size*app.scale) {
			this.remove();
		}
	}

	var connector_radius = 7;
	var connector_input_gfx = new createjs.Graphics();
	connector_input_gfx.setStrokeStyle(2);
	connector_input_gfx.beginStroke('#AAA');
	connector_input_gfx.beginFill('#888');
	connector_input_gfx.drawCircle(0, 0, connector_radius);
	var connector_output_gfx = new createjs.Graphics();
	connector_output_gfx.setStrokeStyle(2);
	connector_output_gfx.beginStroke('#0AA');
	connector_output_gfx.beginFill('#088');
	connector_output_gfx.drawCircle(0, 0, connector_radius);

	function Connector(type, circuit) {
		this.type = type;
		this.circuit = circuit;
		this.index = 0; 
		this.wires = [];
		this.gfx = new createjs.Shape(type === 'input' ? connector_input_gfx : connector_output_gfx);
		this.globalX = 0;
		this.globalY = 0;
		this.recycleWires = function recycleWires() {
			for (var i = this.wires.length - 1; i >= 0; i--) {
				Wire.recycle(this.wires[i]);
			}
		};

		if (type === 'output') {
			this.gfx.on('mousedown', app.startNewWire, this);
			this.gfx.on('pressmove', app.dragNewWire, this);
			this.gfx.on('pressup', app.endNewWire, this);
		}

		this.gfx.on('click', this.recycleWires, this);
	}
	Circuit.active = [];
	return Circuit;
})();

var Wire = (function WireFactory() {
	var next_wire_id = 0;
	var Wire = function Wire() {
		this.id = next_wire_id++;
		this.gfx = new createjs.Shape();
		this.gfx.mouseEnabled = false;
		this.has_power = false;
		this.output = null;
		this.input = null;
	};

	Wire.on_color = '#0FF';
	Wire.off_color = '#088';

	Wire.prototype.draw = function draw(straight_wire) {
		app.needs_update = true;

		var fromX = this.output.globalX;
		var fromY = this.output.globalY;
		var toX = this.input.globalX;
		var toY = this.input.globalY;
		var diffX = toX - fromX;
		var diffY = toY - fromY;
		var diffAbsX = Math.abs(diffX);
		var diffAbsY = Math.abs(diffY);
		var extend_x = 0;
		var extend_y = 0;
		var extend_x_max = 400;

		if (!straight_wire) {
			extend_x = diffX / 1.5;
			if (diffX >= 0) {
				extend_x *= 0.25;
			}
			else {
				extend_x *= -1;
				extend_y = diffY / 6;
				extend_y += (diffAbsX / 8) * (diffAbsY > 80 ? 1 : diffAbsY / 80);
				if (diffAbsX < 80) {
					extend_y *= diffAbsX / 80;
				}
			}
			extend_x += Math.min(50, diffAbsY);
			extend_x += diffAbsY / 6;

			if (extend_x > extend_x_max) {
				extend_x = extend_x_max;
			}
		}
		this.gfx.graphics.clear();
		this.gfx.graphics.setStrokeStyle(2);
		this.gfx.graphics.beginStroke(this.has_power ? Wire.on_color : Wire.off_color);
		this.gfx.graphics.moveTo(fromX, fromY);
		if (straight_wire) {
			this.gfx.graphics.lineTo(toX, toY);
		}
		else {
			this.gfx.graphics.bezierCurveTo(
				fromX + extend_x,
				fromY + extend_y,
				toX - extend_x,
				toY - extend_y,
				toX,
				toY
			);
		}
		this.gfx.graphics.endStroke();
	};

	Wire.prototype.powerChange = function powerChange(power) {
		this.has_power = power;
		this.draw();
		this.input && this.input.circuit.inputChange();
	};
	Wire.pool = [];
	Wire.new = function newWire(output_conn, input_conn) {
		var w = this.pool.pop() || new Wire();
		w.output = output_conn;
		w.input = input_conn;
		return w;
	};

	Wire.recycle = function recycleWire(w) {
		app.needs_update = true;

		w.has_power = false;
		if (w.output) {
			for (var i = w.output.wires.length - 1; i >= 0; i--) {
				if (w.output.wires[i].id === w.id) {
					w.output.wires.splice(i, 1);
					break;
				}
			}
		}
		if (w.input) {
			w.input.wires.splice(0, 1);
			w.input.circuit.inputChange();
		}
		w.output = null;
		w.input = null;
		app.wires.removeChild(w.gfx);
		this.pool.push(w);
	};
	return Wire;
})();

var MyMath = {
	toDeg: 180/Math.PI,
	toRad: Math.PI/180,
	halfPI: Math.PI/2,
	pointDist: function(x1, y1, x2, y2) {
		var x_dist = x2-x1;
		var y_dist = y2-y1;
		return Math.sqrt(x_dist*x_dist + y_dist*y_dist);
	},
	pointAngle: function(x1, y1, x2, y2) {
		return MyMath.halfPI+Math.atan2(y2-y1, x2-x1);
	},
	split_vector: function(speed, angle) {
		return {x: Math.sin(angle)*speed, y: -Math.cos(angle)*speed};
	},
	randomInt: function(min, max) {
		return ((Math.random()*(max-min+1)) | 0) + min;
	},
	randomChoice: function(choices) {
		if (arguments.length === 1 && Array.isArray(choices))
			return choices[(Math.random()*choices.length) | 0];
		return arguments[(Math.random()*arguments.length) | 0];
	}
};

function saveProject(pretty_print) {
	var json = {};
	json.canvas = {
		x: (app.circuits.x - app.stage.canvas.width / 2 / app.scale) | 0,
		y: (app.circuits.y - app.stage.canvas.height / 2 / app.scale) | 0
	};
	json.circuits = Circuit.active.map(function(c) {
		var c_json = {};

		c_json.type = c.type;
		c_json.id = c.id;
		c_json.x = c.gfx.x | 0;
		c_json.y = c.gfx.y | 0;
		if (c.delay > 1) c_json.delay = c.delay;
		if (Object.keys(c.data).length) c_json.data = c.data;
		var has_wires = false;
		if (c.outputs.length) {
			for (var i = c.outputs.length - 1; i >= 0; i--) {
				if (c.outputs[i].wires.length) {
					has_wires = true;
					break;
				}
			}
		}

		if (has_wires) {
			c_json.output_connections = c.outputs.map(function(o) {
				return {
					wires: o.wires.map(function(w) {
						var i = w.input;
						return {
							input_circuit_id: i.circuit.id,
							input_index: i.index
						};
					})
				};
			});
		}

		return c_json;
	});

	return pretty_print ? JSON.stringify(json, null, '\t') : JSON.stringify(json);
}

function loadProject(json) {
	try {
		json = JSON.parse(json);
	}
	catch(e) {
		alert('Could not load project, data is corrupted.');
		return false;
	}

	for (var i = Circuit.active.length - 1; i >= 0; i--) {
		Circuit.active[i].remove();
	}

	app.circuits.x = app.wires.x = (json.canvas.x + app.stage.canvas.width / 2 / app.scale);
	app.circuits.y = app.wires.y = (json.canvas.y + app.stage.canvas.height / 2 / app.scale);
	var highest_id = 0;
	for (var i = 0, len = json.circuits.length; i < len; i++) {
		var c = json.circuits[i];
		if (c.id > highest_id) highest_id = c.id;
		if (!c.data) c.data = {};
		c.data.delay = c.delay || 1;
		var new_circuit = makeType(c.type, c.x, c.y, c.data);
		new_circuit.id = c.id;
	}

	Circuit.setNextId(highest_id + 1);

	for (var i = 0, len = json.circuits.length; i < len; i++) {
		var c = json.circuits[i];
		if (c.output_connections) {
			var new_circuit = Circuit.findById(c.id);
			for (var n = 0, len2 = c.output_connections.length; n < len2; n++) {
				var o = c.output_connections[n];
				if (!o.wires.length) continue;
				for (var j = 0, len3 = o.wires.length; j < len3; j++) {
					var w = o.wires[j];
					var output_connection = new_circuit.outputs[n];
					var input_connection = Circuit.findById(w.input_circuit_id).inputs[w.input_index];
					var wire = Wire.new(output_connection, input_connection);
					output_connection.wires.push(wire);
					input_connection.wires.push(wire);
					window.app.wires.addChild(wire.gfx);
					wire.powerChange(new_circuit.has_power);
				}
			}
		}
	}

	window.app.needs_update = true;
	return true;
}

function copyTextToClipboard(text) {
	var textArea = document.createElement("textarea");
	textArea.style.position = 'fixed';
	textArea.style.top = 0;
	textArea.style.left = 0;
	textArea.style.width = '2em';
	textArea.style.height = '2em';
	textArea.style.padding = 0;
	textArea.style.border = 'none';
	textArea.style.outline = 'none';
	textArea.style.boxShadow = 'none';
	textArea.style.background = 'transparent';
	textArea.value = text;
	document.body.appendChild(textArea);
	textArea.select();
	var copy_successful;
	try {
		var copy_successful = document.execCommand('copy');
	} catch (err) {
		copy_successful = false;
	}
	document.body.removeChild(textArea);
	if (!copy_successful) {
		console.log('Could not copy to clipboard, data is displayed below:');
		console.log(text);
		var ctrl_key = (navigator.platform.indexOf('Mac') === -1) ? 'Ctrl' : 'Cmd';
		window.prompt('Copy to clipboard: ' + ctrl_key + '+C, Enter. Some browsers may truncate long strings!', text);
	}
	return copy_successful;
}