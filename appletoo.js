var AppleToo = function(options) {
  if (options === undefined){
    options = default_options;
  } else {
    options = extend(default_options, options);
  }
  // Memory is stored as numbers
  // See: http://jsperf.com/tostring-16-vs-parseint-x-16
  this.memory = [];
  // Registers
  this.AC = 0;
  this.XR = 0;
  this.YR = 0;
  this.SR = 0;
  this.SP = 0xFF;
  this.PC = 0xC000;

  this.slots = new Array(8);

  this.COMPATIBILITY_MODE = options.compatibility;

  this.pixel_w = 3;
  this.pixel_h = 3;
  this.char_w = this.pixel_w * 7;
  this.char_h = this.pixel_h * 8;

  this.screen = document.getElementById(options.screen);
  if (this.screen) {
    this.ctx = this.screen.getContext("2d");
  }
  this.display = !!this.screen;
  this.display_page = 0;

  this.running = true;

  this.cycles = 0;

  this.initialize_memory();
};

AppleToo.COLORS = {
  green: "#00FF00"
};

AppleToo.prototype.load_memory = function(addr, data) {
  data = data.replace(/\s+/g, "");

  for (var i = 0; i < data.length; i += 2) {
    this.memory[addr + i/2] = parseInt(data.substr(i, 2), 16);
  }
};

var default_options = {
  compatiblity: false,
  screen: "screen",
  rom: null
};

// TODO: Make this less horrible?
AppleToo.prototype.draw = function() {
  if (!this.display) { return; }
  this.screen.width = this.screen.width; //Clear Screen (This will be very slow in FF)
  if (this.display_res === "low") {
    for (var row = 0; row < 24; row++) {
      for (var col = 0; col < 40; col++) {
        if (this.display_mode === "graphics") {
          var val = this._read_memory(ROW_ADDR[this.display_page][row] + col),
              top = (val & 0xF0) >> 4,
              bottom = val & 0x0F;

          this.draw_pixel(row, col, top, bottom);
        } else if (this.display_mode === "text") {
          var val = this._read_memory(ROW_ADDR[this.display_page][row] + col);

          this.draw_lowtext(row, col, val);
        }
      }
    }
  } else {
    for (var row = 0; row < 192; row++) { //192 = 24 Char Rows * 8 Pixel Rows
      var row_data = this.ctx.createImageData(this.pixel_w * 280, 1), // 7 pixels * 40 cols
          pixels = row_data.data,
          row_offset = HIGH_RES_ROW_ADDR[this.display_page][row];
      for (var byte = 0; byte < 40; byte++) {
        var val = this._read_memory(row_offset + byte);
        this.byte_to_rgba(val, pixels, byte * 7 * 4 * this.pixel_w); //7 pixels times 4 elements RGBA
      }
      for (var css_pixel_row = 0; css_pixel_row < this.pixel_h; css_pixel_row++) {
        a.ctx.putImageData(row_data, 0, row * this.pixel_h + css_pixel_row);
      }
    }
  }
};

/* See page 35 of the Apple IIe Technical Reference Manual
 * We use these offests to generate the 192 pixel rows for display page one and the
 * 192 pixel rows for display page two. */
var HIGH_RES_CHAR_ROW_OFFSETS = [
  0x2000, // row 0
  0x2080,
  0x2100,
  0x2180,
  0x2200,
  0x2280,
  0x2300,
  0x2380,
  0x2028,
  0x20A8,
  0x2128,
  0x21A8,
  0x2228,
  0x22A8,
  0x2328,
  0x23A8,
  0x2050,
  0x20D0,
  0x2150,
  0x21D0,
  0x2250,
  0x22D0,
  0x2350,
  0x23D0 // row 23
];

var HIGH_RES_ROW_ADDR = [[],[]];
(function () {
  var page_offset = 0x2000;
  for (var page = 0; page < 2; page++){
    for (var pixel_row = 0; pixel_row < 192; pixel_row++) {
      var addr = page_offset * page; // Beginning of display page
      addr += HIGH_RES_CHAR_ROW_OFFSETS[Math.floor(pixel_row / 8)]; // Offset for char row
      addr += pixel_row % 8 * 0x400; // Offset for pixel row

      HIGH_RES_ROW_ADDR[page].push(addr);
    }
  };
})();

AppleToo.prototype.byte_to_rgba = function(byte, pixels, index) {
  for (var i = 0; i < 7; i++) {
    var on = (byte >> i) & 1,
        offset = index + (i * 4 * this.pixel_w);
    for (var k = 0; k < this.pixel_w * 4; k+=4 ) {
      pixels[offset + k] = 0;               //Red
      pixels[offset + 1 + k] = (on * 0xFF); //Green
      pixels[offset + 2 + k] = 0;           //Blue
      pixels[offset + 3 + k] = 0xFF;        //Alpha
    }
  }
};

AppleToo.prototype.draw_pixel = function(row, col, top, bottom) {
  var x = col * this.char_w,
      y = row * this.char_h;

  this.ctx.fillStyle = top == 0 ? "black" : AppleToo.COLORS.green;
  this.ctx.fillRect(x, y, this.char_w, this.char_h/2);

  this.ctx.fillStyle = bottom == 0 ? "black" : AppleToo.COLORS.green;
  this.ctx.fillRect(x, y + this.char_h/2, this.char_w, this.char_h/2);
};

AppleToo.prototype.draw_lowtext = function(row, col, char) {
  var x = col * this.char_w,
      y = row * this.char_h + this.char_h,
      font = (this.char_h * (7/8)) + " px Monaco";

  if (char == 255) console.log("Delete");
  if (typeof char === "number") {
    char = String.fromCharCode(char & 0x7F);
  }
  if (this.ctx.font != font) {
    this.ctx.font = font;
  }
  this.ctx.fillStyle = char == "" ? "black" : AppleToo.COLORS.green;
  this.ctx.fillText(char, x, y);
};

AppleToo.prototype.update_soft_switch = function(addr, val) {
  if ((addr & 0xFF00) == 0xC000 && (addr & 0xFF) >= 0x90) {
    var device = slots[(addr & 0x70) >> 4];
    return device ? device.update_soft_switch(addr, val) : 0;
  }
  switch (addr) {
    case 0xC010: //Clear Keyboard Strobe
      this._write_memory(0xC000, 0x00);
      break;
    case 0xC050: //Graphics
      this.display_mode = "graphics";
      this._write_memory(0xC01A, 0x00);
      break;
    case 0xC051: //Text
      this.display_mode = "text";
      this._write_memory(0xC01A, 0xFF);
      break;
    case 0xC052: //Full Graphics
      this.display_split = "full";
      break;
    case 0xC053: //Split Screen
      this.display_split = "split";
      break;
    case 0xC054: //Page one
      this.display_page = 0;
      this._write_memory(0xC01C, 0x00);
      break;
    case 0xC055: //Page two
      this.display_page = 1;
      this._write_memory(0xC01C, 0xFF);
      break;
    case 0xC056: //Low Res
      this.display_res = "low";
      this._write_memory(0xC01D, 0x00);
      break;
    case 0xC057: //High Res
      this.display_res = "high";
      this._write_memory(0xC01D, 0xFF);
      break;
    default:
      return undefined;
  }
  return 0;
};

AppleToo.prototype.run6502 = function(program, pc) {
  this.PC = pc === undefined ? 0xC000 : pc;

  this.load_memory(0xC000, program);
  this.run_loop();
};

AppleToo.prototype.run_loop = function() {
  this.running = true;

  // XXX REMOVE ME
  //this.PC = this.read_word(0xFFFC)

  var self = this;
  this.loop_id = setInterval(function() {
    var cycles = self.cycles;
    while (self.cycles < cycles + 10000) {
      self.run(self._read_memory(self.PC++));
    }

    self.draw();

    if (!self.running) {
      clearInterval(self.loop_id);
    }
  },20);
};

AppleToo.prototype.stopRunning = function() {
  this.running = false;

  clearInterval(this.loop_id);
};

AppleToo.prototype.run = function(opcode) {
  return OPCODES[opcode].call(this);
};

AppleToo.prototype.immediate = function() {
  return this.PC++;
};
//implied addressing mode function unnecessary
AppleToo.prototype.accumulator = function() {
  return this.AC;
};
AppleToo.prototype.relative = function() {
  var jump = unsigned_to_signed(this._read_memory(this.PC++));
  return this.PC + jump;
};
AppleToo.prototype.zero_page = function() {
  if (this._read_memory(this.PC) > 0xFF) throw new Error("Zero_Page boundary exceeded");
  return this._read_memory(this.PC++);
};
AppleToo.prototype.zero_page_indexed_with_x = function() {
  var addr = this._read_memory(this.PC++) + this.XR;
  if (addr > 0xFF) throw new Error("Zero_Page boundary exceeded");
  return addr;
};
AppleToo.prototype.zero_page_indexed_with_y = function() {
  var addr = this._read_memory(this.PC++) + this.YR;
  if (addr > 0xFF) throw new Error("Zero_Page boundary exceeded");
  return addr;
};
AppleToo.prototype.absolute = function() {
  var addr = this.read_word(this.PC);
  this.PC += 2;
  return addr;
};
AppleToo.prototype.absolute_indexed_with_x = function() {
  var addr = this.read_word(this.PC) + this.XR;
  this.PC += 2;
  return addr;
};
AppleToo.prototype.absolute_indexed_with_y = function() {
  var addr = this.read_word(this.PC) + this.YR;
  this.PC += 2;
  return addr;
};
AppleToo.prototype.absolute_indirect = function() {
  var addr = this.read_word(this.PC);
  if (this.COMPATIBILITY_MODE && addr | 0x00FF === 0x00FF){
    addr = this._read_memory(addr) + (this._read_memory(addr & 0xFF00) << 8);
  } else {
    addr = this.read_word(addr);
  }
  this.PC += 2;
  return addr;
};
AppleToo.prototype.indexed_x_indirect = function() {
  var addr = this._read_memory(this.PC++);
  if (addr > 0xFF) throw new Error("Zero_Page boundary exceeded");

  addr = (addr + this.XR) % 255;
  return this.read_word(addr);
};
AppleToo.prototype.indirect_indexed_y = function() {
  var addr = this._read_memory(this.PC++),
      low = this._read_memory(addr) + this.YR,
      high = this._read_memory(addr + 1);

  if ((low & 0xFF) != low) { // Handle carry from adding YR
    low &= 0xFF;
    high += 1;
  }

  return (high << 8) + low;
};

AppleToo.prototype.print_registers = function() {
  console.log("--------------");
  console.log("AC: " + this.AC);
  console.log("XR: " + this.XR);
  console.log("YR: " + this.YR);
  console.log("SR: " + this.SR);
  console.log("SP: " + this.SP);
  console.log("PC: " + this.PC);
  console.log("--------------");
};

AppleToo.prototype.initialize_memory = function() {
  for (var i=0; i<65536; i++) {
    this.memory[i] = 0;
  }
};

AppleToo.MEM_ROM_EXTERNAL = 0x24000;

AppleToo.prototype.setPeripheral = function(peripheral, slot) {
  this.slots[slot] = peripheral;

  var offset = AppleToo.MEM_ROM_EXTERNAL + (slot << 8);
  for (var i = 0; i < 0x100; i++)
    this.memory[offset + i] = peripheral.memoryRead(i);
};

//Not used, dead code?
AppleToo.prototype.read_memory = function(loc, word) {
  if (typeof loc === "string") {
    loc = parseInt(loc, 16);
  }
  if (word !== undefined) {
    return (this.memory[loc + 1].toString(16) + this.memory[loc].toString(16)).toString(16);
  }
  return this.memory[loc].toString(16).toUpperCase();
};

AppleToo.prototype._read_memory = function(loc) {
  var soft_switch_data =  this.update_soft_switch(loc);
  return soft_switch_data !== undefined ? soft_switch_data : this.memory[loc];
};

AppleToo.prototype.write_memory = function(loc, val) {
  if (typeof loc === "string") loc = parseInt(loc, 16);
  if (typeof val === "string") val = parseInt(val, 16);

  if (this.update_soft_switch(loc, val) !== undefined) {
    return;
  }

  if (val < 0) {
    throw new Error("ERROR: AT 0x"+this.PC.toString(16).toUpperCase()+" Tried to write a negative number ("+val.toString(16).toUpperCase()+"h) to memory (0x"+loc.toString(16).toUpperCase()+")");
  } else if (val <= 255 ) {
    this.memory[loc] = val;
  } else {
    console.log(val);
    throw new Error("ERROR: Tried to write more than a word!");
  }
};

// Internally, data in memory is numbers, not strings.
AppleToo.prototype._write_memory = function(loc, val) {
  if (typeof loc === "string") {
    loc = parseInt(loc, 16);
  }

  if (this.update_soft_switch(loc, val) !== undefined) {
    return;
  }

  if (val < 0) {
    throw new Error("ERROR: AT 0x"+this.PC.toString(16).toUpperCase()+" Tried to write a negative number ("+val.toString(16).toUpperCase()+"h) to memory (0x"+loc.toString(16).toUpperCase()+")");
  } else if (val <= 255 ) {
    this.memory[loc] = val;
  } else if (val <= 65535) {
    var high_byte = (val & 0xFF00) >> 8,
        low_byte = val & 0x00FF;
    this.memory[loc] = low_byte;
    this.memory[loc+1] = high_byte;
  } else {
    throw new Error("ERROR: Tried to write more than a word!");
  }
};

AppleToo.prototype.read_word = function(addr) {
 return this._read_memory(addr) + (this._read_memory(addr + 1) << 8);
};

AppleToo.prototype.set_register = function(register, val) {
  if (typeof val === "string") val = parseInt(val, 16);
  return this[register] = val;
};

AppleToo.prototype.get_status_flags = function() {
  var bits = zero_pad(this.SR, 8, 2).split('');
  bits = bits.map(function(item) {
    return parseInt(item, 10);
  });
  return {
    N: bits[0],
    V: bits[1],
    _: bits[2],
    B: bits[3],
    D: bits[4],
    I: bits[5],
    Z: bits[6],
    C: bits[7]
  };
};

AppleToo.prototype.set_status_flags = function(obj) {
  for (var bit in obj) {
    if (obj[bit]) {
      this.SR = this.SR | SR_FLAGS[bit];
    }
  };
};

AppleToo.prototype._ld_register = function(register, addr) {
  // Reset Zero and Negative Flags
  this.SR &= (255 - SR_FLAGS["Z"] - SR_FLAGS["N"]);

  this[register] = this._read_memory(addr);

  this.update_zero_and_neg_flags(this[register]);
};

AppleToo.prototype.update_zero_and_neg_flags = function(val) {
  this.SR |= (val & SR_FLAGS.N); // Set negative flag
  if (val & SR_FLAGS.N) {
    this.SR |= SR_FLAGS.N;
  } else {
    this.SR &= ~SR_FLAGS.N & 0xFF;
  }

  if (val === 0) {
    this.SR |= SR_FLAGS.Z; //Set zero flag
  } else {
    this.SR &= ~SR_FLAGS.Z & 0xFF; //Clear zero flag
  }
};

AppleToo.prototype.ldy = function(addr) { this._ld_register("YR", addr); };
AppleToo.prototype.ldx = function(addr) { this._ld_register("XR", addr); };
AppleToo.prototype.lda = function(addr) { this._ld_register("AC", addr); };
AppleToo.prototype.stx = function(addr) {
  this._write_memory(addr, this.XR);
};
AppleToo.prototype.sty = function(addr) {
  this._write_memory(addr, this.YR);
};
AppleToo.prototype.sta = function(addr) {
  this._write_memory(addr, this.AC);
};
AppleToo.prototype.adc = function(addr) {
  var val = this._read_memory(addr),
      result = this.AC + val + (this.SR & SR_FLAGS.C);

  if ((this.AC & SR_FLAGS.N) !== (result & SR_FLAGS.N)) {
    this.SR |= SR_FLAGS.V; //Set Overflow Flag
  } else {
    this.SR &= ~SR_FLAGS.V & 0xFF; //Clear Overflow Flag
  }

  this.update_zero_and_neg_flags(result);

  if (this.SR & SR_FLAGS.D) {
    result = to_bcd(from_bcd(this.AC) + from_bcd(val) + (this.SR & SR_FLAGS.C));
    if (result > 99) {
      this.SR |= SR_FLAGS.C;
    } else {
      this.SR &= ~SR_FLAGS.C & 0xFF;
    }
  } else {
    if (result > 0xFF) {
      this.SR |= SR_FLAGS.C;
      result &= 0xFF;
    } else {
      this.SR &= ~SR_FLAGS.C & 0xFF;
    }
  }
  this.AC = result;
};
AppleToo.prototype.sbc = function(addr) {
  var val = this._read_memory(addr),
      borrow = ~this.SR & SR_FLAGS.C,
      result = this.AC - val - borrow,
      twos_comp_diff = unsigned_to_signed(this.AC) - unsigned_to_signed(val) - borrow;

  if (twos_comp_diff > 127 || twos_comp_diff < -128) {
    this.SR |= SR_FLAGS.V; // set overflow
  } else {
    this.SR &= (~SR_FLAGS.V) & 0xFF;
  }

  if (this.SR & SR_FLAGS.D) {
    result = to_bcd(from_bcd(this.AC) - from_bcd(val)) - borrow;

    if (result > 99 || result < 0) {
      this.SR |= SR_FLAGS.V; //Set Overflow Flag
    } else {
      this.SR &= ~SR_FLAGS.V & 0xFF; //Clear Overflow Flag
    }
  }

  if (borrow) {
    this.SR |= SR_FLAGS.C; // set carry
  }
  // TODO: This works, but I still don't quite get "underflows"
  if (result < 0) {
    this.SR &= (~SR_FLAGS.C) & 0xFF;
  }

  this.update_zero_and_neg_flags(result);
  this.AC = result & 0xFF;
};
/* Only to be used with 8-bit registers (i.e., anything but the PC) */
AppleToo.prototype.inc_dec_register = function(register, val) {
  this[register] += val;
  this[register] &= 0xFF;
  this.update_zero_and_neg_flags(this[register]);
};
AppleToo.prototype.inc_dec_memory = function(addr, val) {
  var result = (this._read_memory(addr) + val) & 0xFF;
  this._write_memory(addr, result);
  this.update_zero_and_neg_flags(result);
};
AppleToo.prototype.set_flag = function(flag) {
  this.SR |= SR_FLAGS[flag];
};
AppleToo.prototype.clear_flag = function(flag) {
  this.SR &= ~SR_FLAGS[flag] & 0xFF;
};
AppleToo.prototype.push = function(val) {
  var addr = (0x0100 + this.SP);
  this._write_memory(addr, val);

  if (this.SP <= 0x00) {
    this.SP = 0xFF;
  } else {
    this.SP--;
  }
};
AppleToo.prototype.pop = function(register) {
  this.SP++;
  var addr = (0x0100 + this.SP),
      val = this._read_memory(addr);
  if (register !== undefined) this[register] = val;

  if (addr >= 0x01FF) {
    this.SP = 0xFF;
  }
  return val;
};
AppleToo.prototype.push_word = function(val) {
  var low_byte = val & 0x00FF,
      high_byte = (val & 0xFF00) >> 8;
  this.push(high_byte);
  this.push(low_byte);
};
AppleToo.prototype.pop_word = function() {
  var low_byte = this.pop(),
      high_byte = (this.pop() << 8);

  return low_byte | high_byte;
};

AppleToo.prototype.transfer_register = function(from, to) {
  this[to] = this[from];
  this.cycles += 2;
  this.update_zero_and_neg_flags(this[to]);
};
AppleToo.prototype.logic_op = function(oper, addr) {
  switch (oper) { // TODO: I hate this. I want to pass operators as functions!
    case "AND":
      this.AC = this.AC & this._read_memory(addr);
      break;
    case "ORA":
      this.AC = this.AC | this._read_memory(addr);
      break;
    case "EOR":
      this.AC = this.AC ^ this._read_memory(addr);
  }
  this.AC = this.AC & 0xFF;
  this.update_zero_and_neg_flags(this.AC);
};
AppleToo.prototype.jump = function(addr) {
  this.PC = addr;
};
AppleToo.prototype.rts = function() {
  this.PC = this.pop_word() + 1;
};
AppleToo.prototype.rti = function() {
  this.pop("SR" );
  this.PC = this.pop_word();
};
AppleToo.prototype.branch_flag_set = function(flag) {
  var addr = this.relative();
  if ((this.SR & SR_FLAGS[flag]) === SR_FLAGS[flag]) {
    this.PC = addr;
  }
};
AppleToo.prototype.branch_flag_clear = function(flag) {
  var addr = this.relative();
  if ((this.SR & SR_FLAGS[flag]) === 0) {
    this.PC = addr;
  }
};
AppleToo.prototype.brk = function() {
  //this.running = false;
  this.cycles += 7;

  this.SR |= SR_FLAGS.I;
  this.SR |= SR_FLAGS.B;

  this.push_word(this.PC + 1);
  this.push(this.SR);

  this.PC = this.read_word(0xFFFE);
};

AppleToo.prototype.compare = function(register, addr) {
  var val = this._read_memory(addr),
      diff = this[register] - val;

  if (diff > 0) {
    this.SR |= SR_FLAGS.C;
  } else {
    this.SR &= (~SR_FLAGS.C) & 0xFF;
  }

  this.update_zero_and_neg_flags(diff);
};
AppleToo.prototype.bit = function(addr) {
  var val = this._read_memory(addr),
      conj = this.AC & val;
  this.update_zero_and_neg_flags(conj);

  this.SR &= (~SR_FLAGS.V) & 0xFF;
  this.SR |= val & SR_FLAGS.V;

  this.SR &= (~SR_FLAGS.N) & 0xFF;
  this.SR |= val & SR_FLAGS.N;
};

AppleToo.prototype.shift = function(dir, addr) {
  this._shift(dir, false, addr); // Don't wrap
};
AppleToo.prototype.rotate = function(dir, addr) {
  this._shift(dir, true, addr); // Wrap, i.e., rotate
};
AppleToo.prototype._shift = function(dir, wrap, addr) {
  var val,
      new_val,
      old_carry = this.SR & SR_FLAGS.C;
  if (addr !== undefined) {
    val = this._read_memory(addr);
  } else {
    val = this.AC;
  }

  if (dir.toLowerCase() === "left") {
    new_val = (val << 1) & 0xFF;
    this.SR &= (~SR_FLAGS.C) & 0xFF;
    this.SR |= (val & 128) >> 7; //Get bit 7 (carry)
    if (wrap) new_val |= old_carry;
  } else if (dir.toLowerCase() === "right") {
    new_val = val >> 1;
    this.SR |= val & SR_FLAGS.C;
    if (wrap) new_val |= old_carry << 7;
  } else {
    throw new Error("Invalid shift direction");
  }

  if (addr !== undefined) {
    this.write_memory(addr, new_val);
  } else {
    this.AC = new_val;
  }
  this.update_zero_and_neg_flags(new_val);
};

AppleToo.prototype.mem_range = function(start, end) {
  var temp_mem = this.memory.slice(start, end);
  for (var i in temp_mem) temp_mem[i] = temp_mem[i].toString(16);
  return temp_mem;
};

var OPCODES = {
  0xA0 : function() { this.ldy(this.immediate()); this.cycles += 2; },
  0xA4 : function() { this.ldy(this.zero_page()); this.cycles += 3; },
  0xB4 : function() { this.ldy(this.zero_page_indexed_with_x()); this.cycles += 4; },
  0xAC : function() { this.ldy(this.absolute()); this.cycles += 4; },
  0xBC : function() { this.ldy(this.absolute_indexed_with_x()); this.cycles += 4; },
  0xA2 : function() { this.ldx(this.immediate()); this.cycles += 2; },
  0xA6 : function() { this.ldx(this.zero_page()); this.cycles += 3; },
  0xB6 : function() { this.ldx(this.zero_page_indexed_with_y()); this.cycles += 4; },
  0xAE : function() { this.ldx(this.absolute()); this.cycles += 4; },
  0xBE : function() { this.ldx(this.absolute_indexed_with_y()); this.cycles += 4; },
  0xA9 : function() { this.lda(this.immediate()); this.cycles += 2; },
  0xA5 : function() { this.lda(this.zero_page()); this.cycles += 3; },
  0xB5 : function() { this.lda(this.zero_page_indexed_with_x()); this.cycles += 4; },
  0xAD : function() { this.lda(this.absolute()); this.cycles += 4; },
  0xBD : function() { this.lda(this.absolute_indexed_with_x()); this.cycles += 4; },
  0xB9 : function() { this.lda(this.absolute_indexed_with_y()); this.cycles += 4; },
  0xA1 : function() { this.lda(this.indexed_x_indirect()); this.cycles += 6; },
  0xB1 : function() { this.lda(this.indirect_indexed_y()); this.cycles += 6; },
  0x86 : function() { this.stx(this.zero_page()); this.cycles += 3; },
  0x96 : function() { this.stx(this.zero_page_indexed_with_y()); this.cycles += 4; },
  0x8E : function() { this.stx(this.absolute()); this.cycles += 4; },
  0x84 : function() { this.sty(this.zero_page()); this.cycles += 3; },
  0x94 : function() { this.sty(this.zero_page_indexed_with_x()); this.cycles += 4; },
  0x8C : function() { this.sty(this.absolute()); this.cycles += 4; },
  0x85 : function() { this.sta(this.zero_page()); this.cycles += 3; },
  0x95 : function() { this.sta(this.zero_page_indexed_with_x()); this.cycles += 4; },
  0x8D : function() { this.sta(this.absolute()); this.cycles += 4; },
  0x9D : function() { this.sta(this.absolute_indexed_with_x()); this.cycles += 5; },
  0x99 : function() { this.sta(this.absolute_indexed_with_y()); this.cycles += 5; },
  0x81 : function() { this.sta(this.indexed_x_indirect()); this.cycles += 6; },
  0x91 : function() { this.sta(this.indirect_indexed_y()); this.cycles += 6; },
  0xE8 : function() { this.inc_dec_register("XR", 1); this.cycles += 2; },
  0xC8 : function() { this.inc_dec_register("YR", 1); this.cycles += 2; },
  0xCA : function() { this.inc_dec_register("XR", -1); this.cycles += 2; },
  0x88 : function() { this.inc_dec_register("YR", -1); this.cycles += 2; },
  0xE6 : function() { this.inc_dec_memory(this.zero_page(), 1); this.cycles += 5; },
  0xF6 : function() { this.inc_dec_memory(this.zero_page_indexed_with_x(), 1); this.cycles += 6; },
  0xEE : function() { this.inc_dec_memory(this.absolute(), 1); this.cycles += 6; },
  0xFE : function() { this.inc_dec_memory(this.absolute_indexed_with_x(), 1); this.cycles += 7; },
  0xC6 : function() { this.inc_dec_memory(this.zero_page(), -1); this.cycles += 5; },
  0xD6 : function() { this.inc_dec_memory(this.zero_page_indexed_with_x(), -1); this.cycles += 6;},
  0xCE : function() { this.inc_dec_memory(this.absolute(), -1); this.cycles += 6; },
  0xDE : function() { this.inc_dec_memory(this.absolute_indexed_with_x(), -1); this.cycles += 7; },
  0x38 : function() { this.set_flag("C"); this.cycles += 2; },
  0xF8 : function() { this.set_flag("D"); this.cycles += 2; },
  0x78 : function() { this.set_flag("I"); this.cycles += 2; },
  0x18 : function() { this.clear_flag("C"); this.cycles += 2; },
  0xD8 : function() { this.clear_flag("D"); this.cycles += 2; },
  0x58 : function() { this.clear_flag("I"); this.cycles += 2; },
  0xB8 : function() { this.clear_flag("V"); this.cycles += 2; },
  0xAA : function() { this.transfer_register("AC", "XR"); },
  0x8A : function() { this.transfer_register("XR", "AC"); },
  0xA8 : function() { this.transfer_register("AC", "YR"); },
  0x98 : function() { this.transfer_register("YR", "AC"); },
  0xBA : function() { this.transfer_register("SP", "XR"); },
  0x9A : function() { this.transfer_register("XR", "SP"); },
  0x48 : function() { this.push(this.AC); this.update_zero_and_neg_flags(this.AC); this.cycles += 3; },
  0x08 : function() { this.push(this.SR); this.update_zero_and_neg_flags(this.SR); this.cycles += 3; },
  0x68 : function() { this.pop("AC"); this.update_zero_and_neg_flags(this.AC); this.cycles += 4; },
  0x28 : function() { this.pop("SR"); this.update_zero_and_neg_flags(this.SR); this.cycles += 4; }, // TODO: there's no need to call update_zero_and_neg_flags here, right?
  0x29 : function() { this.logic_op("AND", this.immediate()); this.cycles += 2; },
  0x25 : function() { this.logic_op("AND", this.zero_page()); this.cycles += 3; },
  0x35 : function() { this.logic_op("AND", this.zero_page_indexed_with_x()); this.cycles += 4; },
  0x2D : function() { this.logic_op("AND", this.absolute()); this.cycles += 4; },
  0x3D : function() { this.logic_op("AND", this.absolute_indexed_with_x()); this.cycles += 4; },
  0x39 : function() { this.logic_op("AND", this.absolute_indexed_with_y()); this.cycles += 4; },
  0x21 : function() { this.logic_op("AND", this.indexed_x_indirect()); this.cycles += 6; },
  0x31 : function() { this.logic_op("AND", this.indirect_indexed_y()); this.cycles += 5; },
  0x09 : function() { this.logic_op("ORA", this.immediate()); this.cycles += 2; },
  0x05 : function() { this.logic_op("ORA", this.zero_page()); this.cycles += 3; },
  0x15 : function() { this.logic_op("ORA", this.zero_page_indexed_with_x()); this.cycles += 4; },
  0x0D : function() { this.logic_op("ORA", this.absolute()); this.cycles += 4; },
  0x1D : function() { this.logic_op("ORA", this.absolute_indexed_with_x()); this.cycles += 4; },
  0x19 : function() { this.logic_op("ORA", this.absolute_indexed_with_y()); this.cycles += 4; },
  0x01 : function() { this.logic_op("ORA", this.indexed_x_indirect()); this.cycles += 6; },
  0x11 : function() { this.logic_op("ORA", this.indirect_indexed_y()); this.cycles += 5; },
  0x49 : function() { this.logic_op("EOR", this.immediate()); this.cycles += 2; },
  0x45 : function() { this.logic_op("EOR", this.zero_page()); this.cycles += 3; },
  0x55 : function() { this.logic_op("EOR", this.zero_page_indexed_with_x()); this.cycles += 4; },
  0x4D : function() { this.logic_op("EOR", this.absolute()); this.cycles += 4; },
  0x5D : function() { this.logic_op("EOR", this.absolute_indexed_with_x()); this.cycles += 4; },
  0x59 : function() { this.logic_op("EOR", this.absolute_indexed_with_y()); this.cycles += 4; },
  0x41 : function() { this.logic_op("EOR", this.indexed_x_indirect()); this.cycles += 6; },
  0x51 : function() { this.logic_op("EOR", this.indirect_indexed_y()); this.cycles += 5; },
  0x4C : function() { this.jump(this.absolute()); this.cycles += 3; },
  0x6C : function() { this.jump(this.absolute_indirect()); this.cycles += 5; },
  0x20 : function() { this.push_word(this.PC + 1); this.jump(this.absolute()); this.cycles += 6; },
  0x60 : function() { this.rts(this.immediate()); this.cycles += 6; },
  0x40 : function() { this.rti(); this.cycles += 6; },
  0x90 : function() { this.branch_flag_clear("C"); },
  0xB0 : function() { this.branch_flag_set("C"); },
  0xF0 : function() { this.branch_flag_set("Z"); },
  0xD0 : function() { this.branch_flag_clear("Z"); },
  0x10 : function() { this.branch_flag_clear("N"); },
  0x30 : function() { this.branch_flag_set("N"); },
  0x50 : function() { this.branch_flag_clear("V"); },
  0x70 : function() { this.branch_flag_set("V"); },
  0x2A : function() { this.rotate("left"); this.cycles += 2; },
  0x26 : function() { this.rotate("left", this.zero_page()); this.cycles += 5; },
  0x36 : function() { this.rotate("left", this.zero_page_indexed_with_x()); this.cycles += 6; },
  0x2E : function() { this.rotate("left", this.absolute()); this.cycles += 6; },
  0x3E : function() { this.rotate("left", this.absolute_indexed_with_x()); this.cycles += 7; },
  0x6A : function() { this.rotate("right"); this.cycles += 2; },
  0x66 : function() { this.rotate("right", this.zero_page()); this.cycles += 5; },
  0x76 : function() { this.rotate("right", this.zero_page_indexed_with_x()); this.cycles += 6; },
  0x6E : function() { this.rotate("right", this.absolute()); this.cycles += 6; },
  0x7E : function() { this.rotate("right", this.absolute_indexed_with_x()); this.cycles += 7; },
  0x4A : function() { this.shift("right"); this.cycles += 2; },
  0x46 : function() { this.shift("right", this.zero_page()); this.cycles += 5; },
  0x56 : function() { this.shift("right", this.zero_page_indexed_with_x()); this.cycles += 6; },
  0x4E : function() { this.shift("right", this.absolute()); this.cycles += 6; },
  0x5E : function() { this.shift("right", this.absolute_indexed_with_x()); this.cycles += 7; },
  0x0A : function() { this.shift("left"); this.cycles += 2; },
  0x06 : function() { this.shift("left", this.zero_page()); this.cycles += 5; },
  0x16 : function() { this.shift("left", this.zero_page_indexed_with_x()); this.cycles += 6; },
  0x0E : function() { this.shift("left", this.absolute()); this.cycles += 6; },
  0x1E : function() { this.shift("left", this.absolute_indexed_with_x()); this.cycles += 7; },
  0xC9 : function() { this.compare("AC", this.immediate()); this.cycles += 2; },
  0xC5 : function() { this.compare("AC", this.zero_page()); this.cycles += 3; },
  0xD5 : function() { this.compare("AC", this.zero_page_indexed_with_x()); this.cycles += 4; },
  0xCD : function() { this.compare("AC", this.absolute()); this.cycles += 4; },
  0xDD : function() { this.compare("AC", this.absolute_indexed_with_x()); this.cycles += 4; },//FIXME Page boundaries
  0xD9 : function() { this.compare("AC", this.absolute_indexed_with_y()); this.cycles += 4; },//FIXME Page boundaries
  0xC1 : function() { this.compare("AC", this.indexed_x_indirect()); this.cycles += 6; },
  0xD1 : function() { this.compare("AC", this.indirect_indexed_y()); this.cycles += 5; },
  0xE0 : function() { this.compare("XR", this.immediate()); this.cycles += 2; },
  0xE4 : function() { this.compare("XR", this.zero_page()); this.cycles += 3; },
  0xEC : function() { this.compare("XR", this.absolute()); this.cycles += 4; },
  0xC0 : function() { this.compare("YR", this.immediate()); this.cycles += 2; },
  0xC4 : function() { this.compare("YR", this.zero_page()); this.cycles += 3; },
  0xCC : function() { this.compare("YR", this.absolute()); this.cycles += 4; },
  0x24 : function() { this.bit(this.zero_page()); this.cycles += 3; },
  0x2C : function() { this.bit(this.absolute()); this.cycles += 4; },
  0x69 : function() { this.adc(this.immediate()); this.cycles += 2; },
  0x65 : function() { this.adc(this.zero_page()); this.cycles += 3; },
  0x75 : function() { this.adc(this.zero_page_indexed_with_x()); this.cycles += 4; },
  0x6D : function() { this.adc(this.absolute()); this.cycles += 4; },
  0x7D : function() { this.adc(this.absolute_indexed_with_x()); this.cycles += 4; },
  0x79 : function() { this.adc(this.absolute_indexed_with_y()); this.cycles += 4; },
  0x61 : function() { this.adc(this.indexed_x_indirect()); this.cycles += 6; },
  0x71 : function() { this.adc(this.indirect_indexed_y()); this.cycles += 5; },
  0xE9 : function() { this.sbc(this.immediate()); this.cycles += 2; },
  0xE5 : function() { this.sbc(this.zero_page()); this.cycles += 3; },
  0xF5 : function() { this.sbc(this.zero_page_indexed_with_x()); this.cycles += 4; },
  0xED : function() { this.sbc(this.absolute()); this.cycles += 4; },
  0xFD : function() { this.sbc(this.absolute_indexed_with_x()); this.cycles += 4; },
  0xF9 : function() { this.sbc(this.absolute_indexed_with_y()); this.cycles += 4; },
  0xE1 : function() { this.sbc(this.indexed_x_indirect()); this.cycles += 6; },
  0xF1 : function() { this.sbc(this.indirect_indexed_y()); this.cycles += 5; },
  0xEA : function() { },
  0x00 : function() { this.brk(); }
};

var SR_FLAGS = {
  "N" : 128,
  "V" : 64,
  "_" : 32,
  "B" : 16,
  "D" : 8,
  "I" : 4,
  "Z" : 2,
  "C" : 1
};

var ROW_ADDR = [ //See Figure 2-5 of Apple IIe Technical Reference
  [ //Page One
    0x400,
    0x480,
    0x500,
    0x580,
    0x600,
    0x680,
    0x700,
    0x780,
    0x428,
    0x4A8,
    0x528,
    0x5A8,
    0x628,
    0x6A8,
    0x728,
    0x7A8,
    0x450,
    0x4D0,
    0x550,
    0x5D0,
    0x650,
    0x6D0,
    0x750,
    0x7D0
  ],
  [ //Page Two
    0x800,
    0x880,
    0x900,
    0x980,
    0xA00,
    0xA80,
    0xB00,
    0xB80,
    0x828,
    0x8A8,
    0x928,
    0x9A8,
    0xA28,
    0xAA8,
    0xB28,
    0xBA8,
    0x850,
    0x8D0,
    0x950,
    0x9D0,
    0xA50,
    0xAD0,
    0xB50,
    0xBD0
  ]
];

// Utilities
function zero_pad(n, len, base) {
  len = len || 2;
  base = base || 16;
  var result = n.toString(base).toUpperCase();
  while (result.length < len) {
    result = "0" + result;
  }
  return result;
}

function unsigned_to_signed(val) {
  if (val > 255) throw new Error("unsigned_to_signed only works on 1 byte numbers");
  if (val < 128) return val;
  return (val - 256);
}

function from_bcd(val) {
  var high = (val & 0xF0) >> 4,
      low = val & 0x0F;
  return high * 10 + low;
}

function to_bcd(val) {
  if (val > 99 || val < 0) throw new Error("Bad BCD Value");
  val = val.toString();
  if (val.length === 1) val = "0" + val;
  var digits = val.split("");

  return (parseInt(digits[0],10)<<4) + parseInt(digits[1],10);
}

function extend(base, add) {
  var obj = JSON.parse(JSON.stringify(base)); //Clone base
  for (var i in add) {
    if (add.hasOwnProperty(i)) {
      obj[i] = add[i];
    }
  }
  return obj;
}
// vim: expandtab:ts=2:sw=2
