/**
 * jambOS
 * 
 * @author                  James Arama
 * @copyright               2013
 * @version                 1.0
 */


var jambOS = jambOS || {version: "1.0", name: "jambOS"};


/**
 * Utility scope for jambOS
 * @property {scope}
 */
jambOS.util = {};

/**
 * OS scope for jambOS
 * @property {scope}
 */
jambOS.OS = {};

/**
 * Host scope for jambOS
 * @property {scope}
 */
jambOS.host = {};

//
// Global CONSTANTS
//

var CPU_CLOCK_INTERVAL = 100;   // This is in ms, or milliseconds, so 1000 = 1 second.

var TIMER_IRQ = 0;  // Pages 23 (timer), 9 (interrupts), and 561 (interrupt priority).
// NOTE: The timer is different from hardware/host clock pulses. Don't confuse these.
var KEYBOARD_IRQ = 1;
var PROCESS_INITIATION_IRQ = 2;
var PROCESS_TERMINATION_IRQ = 3;
var CONTEXT_SWITCH_IRQ = 4;
var FSDD_CALL_IRQ = 5;

// memory
var MEMORY_BLOCK_SIZE = 256;
var ALLOCATABLE_MEMORY_SLOTS = 3;
var HEX_BASE = 16;

// modes
var KERNEL_MODE = 0;
var USER_MODE = 1;

// scheduling algorithms
var RR_SCHEDULER = 0;
var FCFS_SCHEDULER = 1;
var PRIORITY_SCHEDULER = 2;

// file system
var MAX_FILESIZE = 60;
var MBR_END_ADRESS = 77;
var ALLOCATABLE_TRACKS = 4;
var ALLOCATABLE_SECTORS = 8;
var ALLOCATABLE_BLOCKS = 8;
var OCCUPIED_BIT = 0;
var TRACK_BIT = 1;
var SECTOR_BIT = 2;
var BLOCK_BIT = 3;
var CONTENT_BIT = 4;

// fsDD Routines
var FSDD_CREATE = 0;
var FSDD_READ = 1;
var FSDD_WRITE = 2;
var FSDD_DELETE = 3;
var FSDD_FORMAT = 4;
var FSDD_LIST_FILES = 5;

//
// Global Variables
//
var _CPU = null;

var _HardDrive = null;

var _OSclock = 0;       // Page 23.

var _Mode = KERNEL_MODE;   // 0 = Kernel Mode, 1 = User Mode.  See page 21.
var _IsOSRunning = false;

var _Canvas = null;               // Initialized in hostInit().
var _TaskbarCanvas = null;        // Initialized in hostInit().
var _DrawingContext = null;       // Initialized in hostInit().
var _TaskbarContext = null;       // Initialized in hostInit().
var _DefaultFontFamily = "sans";  // Ignored, I think. The was just a place-holder in 2008, but the HTML canvas may have use for it.
var _DefaultFontSize = 13;
var _FontHeightMargin = 6;        // Additional space added to font size when advancing a line.

// Default the OS trace to be on.
var _Trace = true;

// Default for stepover
var _Stepover = false;

// OS queues
var _KernelInterruptQueue = null;
var _KernelBuffers = null;
var _KernelInputQueue = null;

// Standard input and output
var _StdIn = null;
var _StdOut = null;

// UI
var _Console = null;
var _OsShell = null;

// helps with our blinking cursor
var _IsTyping = false;

// At least this OS is not trying to kill you. (Yet.)
var _SarcasticMode = false;

// Kernel
var _Kernel = null;

// Control 
var _Control = null;

// Device
var _Device = null;

// For testing...
var _GLaDOS = null;

// for command history
var _CommandHistory = [];
var _CurrentCommandIndex = -1;

// bakward compatibility vars with previous code base
krnInterruptHandler = null;
(function() {

    var slice = Array.prototype.slice, emptyFunction = function() {
    };

    var IS_DONTENUM_BUGGY = (function() {
        for (var p in {toString: 1}) {
            if (p === 'toString')
                return false;
        }
        return true;
    })();

    /** @ignore */
    var addMethods = function(klass, source, parent) {
        for (var property in source) {

            if (property in klass.prototype &&
                    typeof klass.prototype[property] === 'function' &&
                    (source[property] + '').indexOf('callSuper') > -1) {

                klass.prototype[property] = (function(property) {
                    return function() {

                        var superclass = this.constructor.superclass;
                        this.constructor.superclass = parent;
                        var returnValue = source[property].apply(this, arguments);
                        this.constructor.superclass = superclass;

                        if (property !== 'initialize') {
                            return returnValue;
                        }
                    };
                })(property);
            }
            else {
                klass.prototype[property] = source[property];
            }

            if (IS_DONTENUM_BUGGY) {
                if (source.toString !== Object.prototype.toString) {
                    klass.prototype.toString = source.toString;
                }
                if (source.valueOf !== Object.prototype.valueOf) {
                    klass.prototype.valueOf = source.valueOf;
                }
            }
        }
    };

    function Subclass() {
    }

    function callSuper(methodName) {
        var fn = this.constructor.superclass.prototype[methodName];
        return (arguments.length > 1)
                ? fn.apply(this, slice.call(arguments, 1))
                : fn.call(this);
    }

    /**
     * Helper for creation of "classes". Note that pr
     * @method createClass
     * @param parent optional "Class" to inherit from
     * @param properties Properties shared by all instances of this class
     *                  (be careful modifying objects defined here as this would affect all instances)
     * @memberOf fabric.util
     */
    function createClass() {
        var parent = null,
                properties = slice.call(arguments, 0);

        if (typeof properties[0] === 'function') {
            parent = properties.shift();
        }
        function klass() {
            this.initialize.apply(this, arguments);
        }

        klass.superclass = parent;
        klass.subclasses = [];

        if (parent) {
            Subclass.prototype = parent.prototype;
            klass.prototype = new Subclass();
            parent.subclasses.push(klass);
        }
        for (var i = 0, length = properties.length; i < length; i++) {
            addMethods(klass, properties[i], parent);
        }
        if (!klass.prototype.initialize) {
            klass.prototype.initialize = emptyFunction;
        }
        klass.prototype.constructor = klass;
        klass.prototype.callSuper = callSuper;

        /**
         * @property {string} type                 - type of klass
         */
        klass.prototype.type = klass.prototype.type ? klass.prototype.type : "klass";

        /**
         * Returns a string representation of an instance      
         * @method toString                     
         * @return {String}                        - String representation of a
         *                                           Klass object
         */
        klass.prototype.toString = klass.prototype.toString !== null && typeof klass.prototype.toString === "function" ? klass.prototype.toString :  function() {
            return "#<jambOS." + this.type.toUpperCase() + ">";
        };

        /**
         * Basic getter
         * @public
         * @method get
         * @param {String} property               - Key of property we want to get
         *                                          from the monument
         * @return {Any}                          - value of a property
         */
        klass.prototype.get = function(property) {
            return this[property];
        };
        /**
         * Sets property to a given value
         * @public
         * @method set
         * @param {String} key                    - Key we want to set the value for
         * @param {Object|Function} value         - Value of property we want to set
         * @return {jambOS.Klass} thisArg
         * @chainable
         */
        klass.prototype.set = function(key, value) {
            if (typeof key === 'object') {
                for (var prop in key) {
                    this._set(prop, key[prop]);
                }
            }
            else {
                if (typeof value === 'function') {
                    this._set(key, value(this.get(key)));
                }
                else {
                    this._set(key, value);
                }
            }
            return this;
        };

        /**
         * @private
         * @method _set
         * @param key
         * @param value
         */
        klass.prototype._set = function(key, value) {

            this[key] = value;

            return this;
        };

        /**
         * Sets object's properties from options provided
         * @public
         * @method setOptions
         * @param {Object} [options]
         * @returns {jambOS.Monument}
         */
        klass.prototype.setOptions = function(options) {
            for (var prop in options) {
                this.set(prop, options[prop]);
            }
            return this;
        };

        return klass;
    }

    jambOS.util.createClass = createClass;

})();

/**
 * Use a regular expression to remove leading and trailing spaces.
 * Huh?  Take a breath.  Here we go:
 *      - The "|" separates this into two expressions, as in A or B.
 *      - "^\s+" matches a sequence of one or more whitespace characters at 
 *        the beginning of a string.
 *      - "\s+$" is the same thing, but at the end of the string.
 *      - "g" makes is global, so we get all the whitespace.
 *      - "" is nothing, which is what we replace the whitespace with.
 * @public
 * @method trim
 * @param {string} str
 * @returns {string}
 */
jambOS.util.trim = function(str) {
    return str.replace(/^\s+ | \s+$/g, "");
};

/**
 * An easy-to understand implementation of the famous and common Rot13 
 * obfuscator. You can do this in three lines with a complex regular expression, 
 * but I'd have trouble explaining it in the future. There's a lot to be said 
 * for obvious code.
 * @public 
 * @method rot13
 * @param {string} str
 * @returns {string}
 */
jambOS.util.rot13 = function(str) {
    var retVal = "";
    for (var i in str) {
        var ch = str[i];
        var code = 0;
        if ("abcedfghijklmABCDEFGHIJKLM".indexOf(ch) >= 0) {
            code = str.charCodeAt(i) + 13;  // It's okay to use 13.  It's not a magic number, it's called rot13.
            retVal = retVal + String.fromCharCode(code);
        } else if ("nopqrstuvwxyzNOPQRSTUVWXYZ".indexOf(ch) >= 0) {
            code = str.charCodeAt(i) - 13;  // It's okay to use 13.  See above.
            retVal = retVal + String.fromCharCode(code);
        } else {
            retVal = retVal + ch;
        }
    }
    return retVal;
};

/**
 * Performs a deep copy of an object
 * @param {object} obj        
 * @returns {object} newObject
 */
jambOS.util.clone = function(obj) {
    var newObject = $.extend(true, {}, obj)
    return newObject;
};

// initialize host
$(document).ready(function() {
    _Control = new jambOS.host.Control();
});

/**
 * =============================================================================
 * control.class.js
 * 
 * Routines for the hardware simulation, NOT for our client OS itself. In this manner, it's A LITTLE BIT like a hypervisor,
 * in that the Document environment inside a browser is the "bare metal" (so to speak) for which we write code that
 * hosts our client OS. But that analogy only goes so far, and the lines are blurred, because we are using JavaScript in 
 * both the host and client environments.
 * 
 * This (and other host/simulation scripts) is the only place that we should see "web" code, like 
 * DOM manipulation and JavaScript event handling, and so on.  (Index.html is the only place for markup.)
 * 
 * This code references page numbers in the text book: 
 * Operating System Concepts 8th edition by Silberschatz, Galvin, and Gagne.  ISBN 978-0-470-12872-5
 * 
 * @requires globals.js
 * @public
 * @class Control
 * @memberOf jambOS.host
 * =============================================================================
 */

jambOS.host.Control = jambOS.util.createClass(/** @scope jambOS.host.Control.prototype */{
    /**
     * Constructor
     */
    initialize: function() {

        var self = this;

        // initialize Kernel
        _Kernel = new jambOS.OS.Kernel();

        // initialize host device routines
        _Device = new jambOS.host.Device();

        // Get a global reference to the canvas.  TODO: Move this stuff into a Display Device Driver, maybe?
        _Canvas = document.getElementById('display');
        _Canvas.width = $("#divConsole").width() - 10;
        _TaskbarCanvas = document.createElement('canvas');
        _TaskbarCanvas.id = "taskbar";
        _TaskbarCanvas.width = $("#divConsole").width() - 10;
        _TaskbarCanvas.height = 22;
        _TaskbarCanvas.style.zIndex = 8;
        _TaskbarCanvas.style.position = "absolute";
        _TaskbarCanvas.style.borderBottom = "2px solid #000000";
        _TaskbarCanvas.style.background = "#DFDBC3";

        $("#taskbar").append(_TaskbarCanvas);

        // Get a global reference to the drawing context.
        _DrawingContext = _Canvas.getContext('2d');
        _TaskbarContext = _TaskbarCanvas.getContext('2d');

        // Enable the added-in canvas text functions (see canvastext.js for provenance and details).
        CanvasTextFunctions.enable(_DrawingContext);   // TODO: Text functionality is now built in to the HTML5 canvas. Consider using that instead.

        // Clear the log text box.
        document.getElementById("taLog").value = "";

        // Set focus on the start button.
        document.getElementById("btnStartOS").focus();

        // Check for our testing and enrichment core.
        if (typeof Glados === "function") {
            _GLaDOS = new Glados();
            _GLaDOS.init();
        }

        // host start, halt & reset buttons
        // start
        $("#btnStartOS").click(function() {
            self.startOS($(this));
        });

        // halt
        $("#btnHaltOS").click(function() {
            self.haltOS($(this));
        });

        // reset
        $("#btnReset").click(function() {
            self.resetOS($(this));
        });

        // program 1
        $("#taProgramInput").val("A9 03 8D 41 00 A9 01 8D 40 00 AC 40 00 A2 01 FF EE 40 00 AE 40 00 EC 41 00 D0 EF A9 44 8D 42 00 A9 4F 8D 43 00 A9 4E 8D 44 00 A9 45 8D 45 00 A9 00 8D 46 00 A2 02 A0 42 FF 00");

        // program 2
//        $("#taProgramInput").val("A9 00 8D 00 00 A9 00 8D 4B 00 A9 00 8D 4B 00 A2 09 EC 4B 00 D0 07 A2 01 EC 00 00 D0 05 A2 00 EC 00 00 D0 26 A0 4C A2 02 FF AC 4B 00 A2 01 FF A9 01 6D 4B 00 8D 4B 00 A2 02 EC 4B 00 D0 05 A0 55 A2 02 FF A2 01 EC 00 00 D0 C5 00 00 63 6F 75 6E 74 69 6E 67 00 68 65 6C 6C 6F 20 77 6F 72 6C 64 00");
    
        // program 3
//        $("#taProgramInput").val("A9 00 8D 7B 00 A9 00 8D 7B 00 A9 00 8D 7C 00 A9 00 8D 7C 00 A9 01 8D 7A 00 A2 00 EC 7A 00 D0 39 A0 7D A2 02 FF AC 7B 00 A2 01 FF AD 7B 00 8D 7A 00 A9 01 6D 7A 00 8D 7B 00 A9 09 AE 7B 00 8D 7A 00 A9 00 EC 7A 00 D0 02 A9 01 8D 7A 00 A2 01 EC 7A 00 D0 05 A9 01 8D 7C 00 A9 00 AE 7C 00 8D 7A 00 A9 00 EC 7A 00 D0 02 A9 01 8D 7A 00 A2 00 EC 7A 00 D0 AC A0 7F A2 02 FF 00 00 00 00 63 00 63 64 6F 6E 65 00");
        
        // Step over
        $("#btnStepOver").click(function() {
            if (_CPU)
                _CPU.cycle();
        });

        // control register analysis tabs
        $('#registerAnalysisTabs li a, #memoryAnalysisTabs li a').click(function(e) {
            e.preventDefault();
            $(this).tab('show');
        });
    },
    /**
     * Helps keep a the log textarea updated
     * @public
     * @param {string} msg
     * @param {string} source
     */
    hostLog: function(msg, source)
    {
        // Check the source.
        if (!source) {
            source = "?";
        }

        // Note the OS CLOCK.
        var clock = _OSclock;

        // Note the REAL clock in milliseconds since January 1, 1970.
        var now = new Date().getTime();

        // Build the log string.   
        var str = "({ clock:" + clock + ", source:" + source + ", msg:" + msg + ", now:" + now + " })" + "\n";

        // Update the log console.
        var taLog = document.getElementById("taLog");
        taLog.value = str + taLog.value;
        // Optionally update a log database or some streaming service.
    },
    /**
     * Helps with starting the OS
     * @public
     * @param {HTMLElement} btn
     */
    startOS: function(btn)
    {
        // our os should be running now
        _IsOSRunning = true;

        // Disable the start button...
        btn.prop("disabled", true);

        // .. enable the Halt and Reset buttons ...
        $("#btnHaltOS").prop("disabled", false);
        $("#btnReset").prop("disabled", false);

        // .. set focus on the OS console display ... 
        document.getElementById("display").focus();

        // ... Create and initialize the CPU ...
        _CPU = new jambOS.host.Cpu();
        
        // initialize harddrive
        _HardDrive = new jambOS.host.HardDrive({
            fileSystem: new jambOS.OS.FileSystemDriver()
        });

        // ... then set the host clock pulse ...
        _hardwareClockID = setInterval(_Device.hostClockPulse, CPU_CLOCK_INTERVAL);
        // .. and call the OS Kernel Bootstrap routine.
        _Kernel.bootstrap();
    },
    /**
     * Halts the OS
     * @public
     * @param {HTMLElement} btn
     */
    haltOS: function(btn)
    {
        this.hostLog("emergency halt", "host");
        this.hostLog("Attempting Kernel shutdown.", "host");
        // Call the OS shutdown routine.
        _Kernel.shutdown();
        // Stop the JavaScript interval that's simulating our clock pulse.
        clearInterval(_hardwareClockID);

        // Reset is running back to false
        _IsOSRunning = false;

        // TODO: Is there anything else we need to do here?
    },
    /**
     * Helps with resets the the OS
     * @public
     * @param {HTMLElement} btn
     */
    resetOS: function(btn)
    {
        // The easiest and most thorough way to do this is to reload (not refresh) the document.
        location.reload(true);
        // That boolean parameter is the 'forceget' flag. When it is true it causes the page to always
        // be reloaded from the server. If it is false or not specified, the browser may reload the 
        // page from its cache, which is not what we want.
    }
});
/**
 * =============================================================================
 * Devices.js
 * 
 * Routines for the hardware simulation, NOT for our client OS itself. In this 
 * manner, it's A LITTLE BIT like a hypervisor, in that the Document environment 
 * inside a browser is the "bare metal" (so to speak) for which we write code 
 * that hosts our client OS. But that analogy only goes so far, and the lines 
 * are blurred, because we are using JavaScript in both the host and client 
 * environments. 
 * 
 * This (and simulation scripts) is the only place that we should see "web" 
 * code, like DOM manipulation and JavaScript event handling, and so on.  
 * (Index.html is the only place for markup.) 
 * 
 * This code references page numbers in the text book: Operating System Concepts
 * 8th edition by Silberschatz, Galvin, and Gagne.  ISBN 978-0-470-12872-5
 * 
 * @public
 * @class Device
 * @requires global.js
 * @memberOf jambOS.host
 * =============================================================================
 */

var _hardwareClockID = -1;

jambOS.host.Device = jambOS.util.createClass({
    /**
     * Hardware/Host Clock Pulse
     * @public
     * @method hostClockPulse
     */
    hostClockPulse: function()
    {
        // Increment the hardware (host) clock.
        _OSclock++;
        // Call the kernel clock pulse event handler.
        _Kernel.onCPUClockPulse();
    },
    /**
     * Keyboard Interrupt, a HARDWARE Interrupt Request. (See pages 560-561 in 
     * text book.)
     * @public
     * @method hostEnableKeyboardInterrupt
     */
    hostEnableKeyboardInterrupt: function()
    {
        // Listen for key press (keydown, actually) events in the Document
        // and call the simulation processor, which will in turn call the 
        // OS interrupt handler.
        document.addEventListener("keydown", _Device.hostOnKeypress, false);
    },
    /**
     * Disables KeyboardInterrupt
     * @public
     * @method hostDisableKeyboardInterrupt
     */
    hostDisableKeyboardInterrupt: function()
    {
        document.removeEventListener("keydown", _Device.hostOnKeypress, false);
    },
    /**
     * Handles keypress events
     * @public
     * @method hostOnKeypress
     */
    hostOnKeypress: function(event)
    {
        var keyCode = (event.keyCode ? event.keyCode : event.which);

        // The canvas element CAN receive focus if you give it a tab index, which we have.
        // Check that we are processing keystrokes only from the canvas's id (as set in index.html).
        if (event.target.id === "display")
        {
            _isTyping = true;

            event.preventDefault();

            // Note the pressed key code in the params (Mozilla-specific).
            var params = new Array(keyCode, event.shiftKey);
            var keyboardInterrupt = new jambOS.OS.Interrupt({irq: KEYBOARD_IRQ, params: params});
            // Enqueue this interrupt on the kernel interrupt queue so that it gets to the Interrupt handler.
            _KernelInterruptQueue.enqueue(keyboardInterrupt);
        }
    }
});
/**
 *==============================================================================
 * Class Memory
 *    
 * @class Memory
 * @memberOf jambOS 
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.host.Memory = jambOS.util.createClass(/** @scopee jambOS.host.Memory.prototype */{
    /**
     * @property {int} size             - Size of Memory
     */
    size: 0,
    /**
     * @property {array} storage
     */
    storage: new Array(),
    /**
     * @property {string} type
     */
    type: "memory",
    /**
     * Constructor
     * @public
     * @param {object} options
     * @returns {jambOS.host.Memory}
     */
    initialize: function(options) {
        var self = this;

        options || (options = {});
        self.setOptions(options);

        // initialize storage memory array with zeros
        for (var i = 0; i < self.size; i++) {
            self.write(i, 00);
        }

        return this;
    },
    /**
     * Reads data from storage
     * @public
     * @method read
     * @param {string} address
     * @returns data
     */
    read: function(address) {
        return this.get("storage")[address];
    },
    /**
     * Writes to storage
     * 
     * @public
     * @method write
     * @param {string} address
     * @param {object} data
     */
    write: function(address, data) {
        this.get("storage")[address] = data;
    },
    /**
     * Inserts data to storage starting from the specified storage address
     * 
     * @public
     * @method insert
     * @param {int} start starting address point
     * @param {array} data data to add to storage
     */
    insert: function(start, data) {

        var self = this;

        // write to memory
        for (var i = 0; i < data.length; i++) {
            self.write(i + start, data[i]);
        }

        _Kernel.memoryManager.updateMemoryDisplay();
    }
});
/**
 * =============================================================================
 * cpu.class.js
 * Routines for the host CPU simulation, NOT for the OS itself.  
 * In this manner, it's A LITTLE BIT like a hypervisor,
 * in that the Document environment inside a browser is the "bare metal" 
 * (so to speak) for which we write code that hosts our client OS. But that 
 * analogy only goes so far, and the lines are blurred, because we are using 
 * JavaScript in both the host and client environments.
 * 
 * This code references page numbers in the text book: 
 * Operating System Concepts 8th edition by Silberschatz, Galvin, and Gagne.  
 * ISBN 978-0-470-12872-5
 * 
 * @requires globals.js
 * @public
 * @class Cpu
 * @memberOf jambOS.host
 * =============================================================================
 */
jambOS.host.Cpu = jambOS.util.createClass(/** @scope jambOS.host.Cpu.prototype */{
    /**
     * @property {int} pc                       - Program counter
     */
    pc: 0,
    /**
     * @property {int} acc                      - Accumulator
     */
    acc: 0,
    /**
     * @property {int} xReg                     - X Register
     */
    xReg: 0,
    /**
     * @property {int}  yReg                    - Y Register
     */
    yReg: 0,
    /**
     * @property {int}  zFlag                   - Z-ero flag (Think of it as "isZero".)
     */
    zFlag: 0,
    /**
     * @property {boolean} isExecuting          - Is the CPU executing?
     */
    isExecuting: false,
    /**
     * @property {jambOS.OS.CPUScheduler} scheduler 
     */
    scheduler: null,
    /**
     * Constructor
     */
    initialize: function() {
        // set up our cpu scheduler
        this.scheduler = new jambOS.OS.CPUScheduler();
        return this;
    },
    /**
     * Sets cpu registers ready for process execution
     * @public
     * @method start
     * @param {jambOS.OS.ProcessControlBlock} pcb
     */
    start: function(pcb) {
        var self = this;

        // set current process in scheduler
        self.scheduler.set("currentProcess", pcb);

        // set cpu with process' pc and start execution
        self.set({
            pc: pcb.pc,
            isExecuting: true
        });

        // Log our switch to kernel mode
        _Kernel.trace("Switching to Kernel Mode");

        // Switch to Kernel mode
        _MODE = 0;

    },
    /**
     * Resets cpu registers to default values to help stop process execution
     * @public
     * @method stop
     */
    stop: function() {
        var self = this;

        // reset our registers
        self.set({
            pc: 0,
            acc: 0,
            xReg: 0,
            yReg: 0,
            zFlag: 0,
            isExecuting: false
        });

        // update PCB status display in real time
        _Kernel.processManager.updatePCBStatusDisplay(true);

        // if ready queue is not empty continue executing
        if (!self.scheduler.readyQueue.isEmpty())
        {
            _CPU.isExecuting = true;
        }

        // Log our switch to user mode
        _Kernel.trace("Switching to User Mode");

        // Switch to user mode
        _MODE = 1;

        // disable stepover button
        $("#btnStepOver").prop("disabled", true);
    },
    /**
     * Called every clock cycle
     * @public
     * @method cycle
     */
    cycle: function() {
        var self = this;
        _Kernel.trace("CPU cycle");

        // TODO: Accumulate CPU usage and profiling statistics here.
        // Do the real work here. Be sure to set this.isExecuting appropriately.

        // update cpu status display in real time
        _Kernel.processManager.updateCpuStatusDisplay(self);

        // update PCB status display in real time
        _Kernel.processManager.updatePCBStatusDisplay();

        // check if our program counter is within our memory addresses bounds
        if (self.pc > (MEMORY_BLOCK_SIZE * ALLOCATABLE_MEMORY_SLOTS)) {
            self.stop();
            _Kernel.trapError("Invalid Operation!", false);
        }

        if (self.scheduler.currentProcess.slot === -1) {
            if (_Kernel.memoryManager.findOpenSlot() === null) {
                if (!self.scheduler.readyQueue.isEmpty()) {
                    var processToRollOut = _Kernel.memoryManager.getProcessToRollOut();
                    _Kernel.memoryManager.rollOutProcess(processToRollOut);
                } else {
                    var rollIndex;
                    for (i in self.scheduler.residentList) {
                        if (self.scheduler.residentList[i].slot !== -1)
                            rollIndex = i;
                    }
                    _Kernel.memoryManager.rollOutProcess(self.scheduler.residentList[rollIndex]);
                }
            }
            _Kernel.memoryManager.rollInProcess(self.scheduler.currentProcess);
        }

        // get execution operation
        var opCode = _Kernel.memoryManager.memory.read(self.pc++).toString().toLowerCase();
        var operation = self.getOpCode(opCode);
        
        // execute operation
        if (operation) {

            // highlight all the valid operations as we step through them
            $(".operation").removeClass("currentOperation");
            $(".address_" + (self.pc - 1)).addClass("currentOperation").addClass("validOperation");

            operation(self);

            if (self.scheduler.get("currentProcess"))
                self.scheduler.get("currentProcess").set({acc: self.acc, pc: self.pc, xReg: self.xReg, yReg: self.yReg, zFlag: self.zFlag, state: "running"});
        } else {

            // log invalid opcode
            _Kernel.trace("Invalid Operation!");

            // highlight all invalid operations as we step through them
            $(".operation").removeClass("currentOperation");
            $(".address_" + (self.pc - 1)).addClass("currentOperation").addClass("inValidOperation");

            // change background color of active process
            // Found that trapping the error would be just too much on the
            // console!
            $("#pcbStatus table tbody tr.active").addClass("error").removeClass("active");

            // Set process cycle 1 tick close to the quantum so that we can Whiz 
            // through and get to the next process as quick as posible during
            // the context switch
            self.scheduler.processCycles = self.scheduler.quantum - 1;

            // kill process
            var terminationOperation = self.getOpCode("00");
            terminationOperation(self);
        }

        // Perform a context switch if the ready queue is not empty.
        // This is where the magic or realtime multi-processing occurs.
        if (!self.scheduler.readyQueue.isEmpty())
            self.scheduler.scheduleProcess();

    },
    /*------------------Operations -----------------------*/
    /**
     * Gets an opcode function
     * @param {string} opcode
     * @returns {function} opcode routine
     */
    getOpCode: function(opcode) {
        var self = this;
        var opcodes = {
            "a9": self.loadAccWithConstant,
            "ad": self.loadAccFromMemory,
            "8d": self.storeAccInMemory,
            "6d": self.addWithCarry,
            "a2": self.loadXRegWithConstant,
            "ae": self.loadXRegFromMemory,
            "a0": self.loadYRegWithConstant,
            "ac": self.loadYRegFromMemory,
            "00": self.breakOperation,
            "ea": self.noOperation,
            "ec": self.compareXReg,
            "d0": self.branchXBytes,
            "ee": self.incrementByteValue,
            "ff": self.systemCall
        };
        return opcodes[opcode];
    },
    /**
     * Load the accumulator with a constant.
     * opCode: a9     
     * @param {jambOS.host.Cpu} self    
     */
    loadAccWithConstant: function(self)
    {
        var byteCode = _Kernel.memoryManager.memory.read(self.pc++);
        self.acc = parseInt(byteCode, HEX_BASE);
    },
    /**
     * Load the accumulator from memory 
     * opCode: ad
     * @param {jambOS.host.Cpu} self 
     */
    loadAccFromMemory: function(self)
    {
        // Get next two bytes in memory
        var byteCodeOne = _Kernel.memoryManager.memory.read(self.pc++);
        var byteCodeTwo = _Kernel.memoryManager.memory.read(self.pc++);

        var pcb = self.scheduler.get("currentProcess");

        // Concatenate the hex address in the correct order
        var address = parseInt((byteCodeTwo + byteCodeOne), HEX_BASE) + pcb.base;
        var value = _Kernel.memoryManager.memory.read(address);

        if (_Kernel.memoryManager.validateAddress(address))
        {
            self.acc = parseInt(value, HEX_BASE);
        }
    },
    /**
     * Store the accumulator in memory
     * opCode: 8d
     * @param {jambOS.host.Cpu} self 
     */
    storeAccInMemory: function(self)
    {
        // Get next two bytes in memory
        var byteCodeOne = _Kernel.memoryManager.memory.read(self.pc++);
        var byteCodeTwo = _Kernel.memoryManager.memory.read(self.pc++);

        var pcb = self.scheduler.get("currentProcess");

        // Concatenate the hex address in the correct order
        var address = parseInt((byteCodeTwo + byteCodeOne), HEX_BASE) + pcb.base;

        if (_Kernel.memoryManager.validateAddress(address))
        {
            // Convert value of acc to hex
            var hexValue = _Kernel.memoryManager.decimalToHex(self.acc);

            // Place value of acc in hex byte form in memory
            _Kernel.memoryManager.memory.write(address, hexValue);
        }
    },
    /**
     * Add with carry adds contents of an address to the contents of the 
     * accumulator and keeps the result in the accuculator
     * opCode: 6d
     * @param {jambOS.host.Cpu} self 
     */
    addWithCarry: function(self)
    {

        // Get next two bytes in memory
        var byteCodeOne = _Kernel.memoryManager.memory.read(self.pc++);
        var byteCodeTwo = _Kernel.memoryManager.memory.read(self.pc++);

        var pcb = self.scheduler.get("currentProcess");

        // Concatenate the hex address in the correct order
        var address = parseInt((byteCodeTwo + byteCodeOne), HEX_BASE) + pcb.base;
        var value = _Kernel.memoryManager.memory.read(address);

        if (_Kernel.memoryManager.validateAddress(address))
        {
            // Add contents of the memory location and the contents of the acc
            self.acc += parseInt(value, HEX_BASE);
        }
    },
    /**
     * Load the X register with a constant
     * opCode: a2
     * @param {jambOS.host.Cpu} self 
     */
    loadXRegWithConstant: function(self)
    {
        var byteCode = _Kernel.memoryManager.memory.read(self.pc++);
        self.xReg = parseInt(byteCode, HEX_BASE);
    },
    /**
     * Load the X register from memory 
     * opCode: ae
     * @param {jambOS.host.Cpu} self 
     */
    loadXRegFromMemory: function(self)
    {
        // Get next two bytes in memory
        var byteCodeOne = _Kernel.memoryManager.memory.read(self.pc++);
        var byteCodeTwo = _Kernel.memoryManager.memory.read(self.pc++);

        var pcb = self.scheduler.get("currentProcess");

        // Concatenate the hex address in the correct order
        var address = parseInt((byteCodeTwo + byteCodeOne), HEX_BASE) + pcb.base;
        var value = _Kernel.memoryManager.memory.read(address);

        if (_Kernel.memoryManager.validateAddress(address))
        {
            // Place contents of the memory location (in decimal form) in the x register
            self.xReg = parseInt(value, HEX_BASE);
        }
    },
    /**
     * Load the Y register with a constant 
     * opCode: a0
     * @param {jambOS.host.Cpu} self 
     */
    loadYRegWithConstant: function(self)
    {
        // Place the next byte in memory in the Y register
        self.yReg = _Kernel.memoryManager.memory.read(self.pc++);
    },
    /**
     * Load the Y register from memory 
     * opCode: ac
     * @param {jambOS.host.Cpu} self 
     */
    loadYRegFromMemory: function(self)
    {
        // Get next two bytes in memory
        var byteCodeOne = _Kernel.memoryManager.memory.read(self.pc++);
        var byteCodeTwo = _Kernel.memoryManager.memory.read(self.pc++);

        var pcb = self.scheduler.get("currentProcess");

        // Concatenate the hex address in the correct order
        var address = parseInt((byteCodeTwo + byteCodeOne), HEX_BASE) + pcb.base;
        var value = _Kernel.memoryManager.memory.read(address);

        if (_Kernel.memoryManager.validateAddress(address))
        {
            // Place contents of the memory location in the y register
            self.yReg = parseInt(value, HEX_BASE);
        }
    },
    /**
     * No Operation 
     * opCode: ea
     * @param {jambOS.host.Cpu} self 
     */
    noOperation: function(self)
    {
        self.pc++;
    },
    /**
     * Break (which is really a system call) 
     * opCode: 00
     * @param {jambOS.host.Cpu} self 
     */
    breakOperation: function(self) {
        var currentProcess = self.scheduler.currentProcess;

        console.log("terimnated" + currentProcess.pid);

        // deallocate program from memory
        _Kernel.processManager.unload(currentProcess);

        // handle transition to next process
        // useful if ready queue is not yet empty
        switch (self.scheduler.currentSchedulingAlgorithm) {
            case RR_SCHEDULER: // Round Robin                    
                self.scheduler.processCycles = self.scheduler.quantum - 1;
                break;
            case FCFS_SCHEDULER: // First Come First Served
                self.scheduler.processCycles = MEMORY_BLOCK_SIZE - 1;
                break;
            case PRIORITY_SCHEDULER: // Priority Scheduler
                break;
        }

        _Kernel.interruptHandler(PROCESS_TERMINATION_IRQ, self.scheduler.get("currentProcess"));
    },
    /**
     * Compare a byte in memory to the X reg sets the Z (zero) flag if equal 
     * opCode: ec
     * @param {jambOS.host.Cpu} self 
     */
    compareXReg: function(self)
    {
        // Get next two bytes in memory
        var byteCodeOne = _Kernel.memoryManager.memory.read(self.pc++);
        var byteCodeTwo = _Kernel.memoryManager.memory.read(self.pc++);

        var pcb = self.scheduler.get("currentProcess");

        // Concatenate the hex address in the correct order
        var address = parseInt((byteCodeTwo + byteCodeOne), HEX_BASE) + pcb.base;
        var value = _Kernel.memoryManager.memory.read(address);

        if (_Kernel.memoryManager.validateAddress(address))
        {
            // Compare contents of the memory location with the x reg
            // Set z flag if they are equal
            self.zFlag = (parseInt(value) === self.xReg) ? 1 : 0;
        }
    },
    /**
     * Branch X bytes if Z flag = 0
     * opCode: d0
     * @param {jambOS.host.Cpu} self 
     */
    branchXBytes: function(self)
    {
        if (self.zFlag === 0)
        {
            var branchValue = parseInt(_Kernel.memoryManager.memory.read(self.pc++), HEX_BASE);
            self.pc += branchValue;

            if (self.pc > self.scheduler.get("currentProcess").limit)
            {
                self.pc -= MEMORY_BLOCK_SIZE;
            }
        } else
            self.pc++;
    },
    /**
     * Increment the value of a byte 
     * opCode: ee
     * @param {jambOS.host.Cpu} self 
     */
    incrementByteValue: function(self)
    {
        var byteCodeOne = _Kernel.memoryManager.memory.read(self.pc++);
        var byteCodeTwo = _Kernel.memoryManager.memory.read(self.pc++);

        var pcb = self.scheduler.get("currentProcess");
        var address = parseInt((byteCodeTwo + byteCodeOne), HEX_BASE) + pcb.base;
        var value = _Kernel.memoryManager.memory.read(address);

        if (_Kernel.memoryManager.validateAddress(address))
        {
            var decimalValue = parseInt(value, HEX_BASE);

            decimalValue++;

            var hexValue = _Kernel.memoryManager.decimalToHex(decimalValue);

            _Kernel.memoryManager.memory.write(address, hexValue);
        }
    },
    /**
     * System Call 
     *  #$01 in X reg = print the integer stored in the Y register. 
     *  #$02 in X reg = print the 00-terminated string stored at the address in 
     *  the Y register. 
     *  opCode: ff
     * @param {jambOS.host.Cpu} self 
     */
    systemCall: function(self)
    {
        if (self.xReg === 1)
        {
            var value = parseInt(self.yReg).toString();

            for (var i = 0; i < value.length; i++)
            {
                _StdIn.putText(value.charAt(i));
            }
            _StdIn.advanceLine();
            _OsShell.putPrompt();

        } else {

            var pcb = self.scheduler.get("currentProcess");

            var address = parseInt(self.yReg, HEX_BASE) + pcb.base;

            var currentByte = _Kernel.memoryManager.memory.read(address);

            var character = "";
            var keyCode = 0;

            while (currentByte !== "00")
            {
                currentByte = _Kernel.memoryManager.memory.read(address++);
                keyCode = parseInt(currentByte, HEX_BASE);


                character = String.fromCharCode(keyCode);
                _StdIn.putText(character);
            }

            _StdIn.advanceLine();
            _OsShell.putPrompt();
        }
    }
});


/**
 *==============================================================================
 * harddrive.class.js
 *    
 * @class HardDrive
 * @memberOf jambOS.host 
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.host.HardDrive = jambOS.util.createClass({
    /**
     * @property {string} type
     */
    type: "harddrive",
    fileSystem: null,
    /**
     * Constructor
     */
    initialize: function(options) {
        options || (options = {});
        this.setOptions(options);

        if (this._canSupportLocalStorage() && this.fileSystem) {
            this.fileSystem.storage = localStorage;
            this.formatDrive();
        }
    },
    /**
     * Formarts drive
     * @public
     * @method formatDrive
     */
    formatDrive: function() {
        // clear local storage
        this.fileSystem.storage.clear();

        // clear out our filenames
        this.fileSystem.usedFilenames = [];

        // initialize of all the tracks
        for (var track = 0; track < ALLOCATABLE_TRACKS; track++) {
            for (var sector = 0; sector < ALLOCATABLE_SECTORS; sector++) {
                for (var block = 0; block < ALLOCATABLE_BLOCKS; block++)
                    this.resetTSB(track, sector, block);
            }
        }

        // update display
        this.fileSystem.updateHardDriveDisplay();
    },
    /**
     * Resets TSB
     * @public
     * @method resetTSB
     * @param {int} track 
     * @param {int} sector 
     * @param {int} block
     */
    resetTSB: function(track, sector, block) {

        var tsbValue = "[0,-1,-1,-1,\"" + this.fileSystem.sanitizeFileSystemValue("") + "\"]";

        // MBR at TSB(0,0,0)
        if (track === 0 && sector === 0 && block === 0)
            tsbValue = "[1,-1,-1,-1,\"" + this.fileSystem.sanitizeFileSystemValue("MBR") + "\"]";

        this.fileSystem.write("[" + track + "," + sector + "," + block + "]", tsbValue);
    },
    /**
     * Initializes tsb
     * @public 
     * @method initializeTSB
     * @param {object} tsb
     * @param {string} filename
     */
    initializeTSB: function(tsb, filename) {

        var fileNameTSB = jambOS.util.clone(tsb);
        var fileDataTSB = this.findNextAvailableDataTSB();

        var fileDataAdress = this.fileSystem._getAddress(fileDataTSB);
        var fileNameAddress = this.fileSystem._getAddress(fileNameTSB);
        var value = JSON.parse(this.fileSystem.read(fileDataAdress));
        var occupiedBit = value[OCCUPIED_BIT];
        var track = value[TRACK_BIT];
        var sector = value[SECTOR_BIT];
        var block = value[BLOCK_BIT];

        if (occupiedBit === 0)
            occupiedBit = 1;

        // add filename to usedFilenames array
        this.fileSystem.usedFilenames.push({filename: filename, address: fileNameAddress});

        // file metadata
        var value = "[" + occupiedBit + "," + fileDataTSB.track + "," + fileDataTSB.sector + "," + fileDataTSB.block + ",\"" + this.fileSystem.sanitizeFileSystemValue(filename) + "\"]";
        this.fileSystem.write(fileNameAddress, value);

        // file data
        var value = "[" + occupiedBit + "," + track + "," + sector + "," + block + ",\"" + this.fileSystem.sanitizeFileSystemValue("") + "\"]";
        this.fileSystem.write(fileDataAdress, value);
    },
    /**
     * Finds the next available tsb
     * @public
     * @method findNextAvailable
     * @returns {object} tsb
     */
    findNextAvailableTSB: function() {
        var decimalAddress = 0;
        var value = [];
        var occupiedBit = -1;

        // loop through address in storage
        for (var address in this.fileSystem.storage)
        {
            var tsb = this.fileSystem._parseAddress(address);
            decimalAddress = parseInt(tsb.track.toString() + tsb.sector.toString() + tsb.block.toString());

            // We don't want to loop through the filenames
            if (decimalAddress >= 0 && decimalAddress <= MBR_END_ADRESS)
            {
                value = JSON.parse(this.fileSystem.storage[address]);
                occupiedBit = value[0];

                // return tsb if not occupied
                if (occupiedBit === 0)
                {
                    return tsb;
                }
            }
        }

        return null;
    },
    /**
     * Finds the next available tsb
     * @public
     * @method findNextAvailable
     * @returns {object} tsb
     */
    findNextAvailableDataTSB: function() {
        var decimalAddress = 0;
        var value = [];
        var occupiedBit = -1;

        // loop through address in storage
        for (var address in this.fileSystem.storage)
        {
            var tsb = this.fileSystem._parseAddress(address);
            decimalAddress = parseInt(tsb.track.toString() + tsb.sector.toString() + tsb.block.toString());

            // We don't want to loop through the filenames
            if (decimalAddress > MBR_END_ADRESS)
            {
                value = JSON.parse(this.fileSystem.storage[address]);
                occupiedBit = value[0];

                // return tsb if not occupied
                if (occupiedBit === 0)
                {
                    return tsb;
                }
            }
        }

        return null;
    },
    /**
     * Checks for html5 storage support
     * @private
     * @method _canSupportLocalStorage
     * @returns {boolean} true|false
     */
    _canSupportLocalStorage: function() {
        try {
            return "localStorage" in window && window["localStorage"] !== null;
        } catch (e) {
            return false;
        }
    }
});
/**
 *==============================================================================
 * cpuscheduler.class.js
 *    
 * @class CPUScheduler
 * @memberOf jambOS.OS
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.CPUScheduler = jambOS.util.createClass(/** @scope jambOS.OS.CPUScheduler.prototype */ {
    /**
     * @property {int} processCycles
     */
    processCycles: 0,
    /**
     * @property {int} quantum
     */
    quantum: 6,
    /**
     * @property {jambOS.OS.ProcessQueue} readyQueue
     */
    readyQueue: null,
    /**
     * @property {[jambOS.OS.ProcessControlBlock]} residentList
     */
    residentList: [],
    /**
     * @property {int} currentProcessID
     */
    currentProcessID: 0,
    /**
     * @property {jambOS.OS.ProcessControlBlock} currentProcess
     */
    currentProcess: null,
    /**
     * @property {jambOS.OS.ProcessControlBlock} previousProcess    
     */
    previousProcess: null,
    /**
     * @property {int} currentSchedulingAlgorithm
     */
    currentSchedulingAlgorithm: RR_SCHEDULER,
    /**
     * Constructor
     */
    initialize: function() {
        // initalize our ready queue
        this.readyQueue = new jambOS.OS.ProcessQueue();
    },
    /**
     * Shechules a process
     * @public
     * @method scheduleProcess
     */
    scheduleProcess: function() {
        var self = this;
        if (_CPU.isExecuting) {

            self.processCycles++;

            switch (self.get("currentSchedulingAlgorithm")) {
                case RR_SCHEDULER: // Round Robin

                    // perform a swithc when we the cycles hit our scheduling quantum to
                    // simulate the real time execution
                    if (!self.readyQueue.isEmpty() && self.processCycles === self.quantum) {
                        self.processCycles = 0;
                        _Kernel.interruptHandler(CONTEXT_SWITCH_IRQ);
                    }
                    break;
                case FCFS_SCHEDULER: // First Come First Served
                    // perform a swithc when we the cycles hit our scheduling quantum to
                    // simulate the real time execution
                    if (!self.readyQueue.isEmpty() && self.processCycles === MEMORY_BLOCK_SIZE) {
                        self.processCycles = 0;
                        _Kernel.interruptHandler(CONTEXT_SWITCH_IRQ);
                    }
                    break;
                case PRIORITY_SCHEDULER: // Priority Scheduler
                    // perform a swithc when we the cycles hit our scheduling quantum to
                    // simulate the real time execution
                    if (!self.readyQueue.isEmpty() && self.processCycles === MEMORY_BLOCK_SIZE) {
                        self.processCycles = 0;
                        _Kernel.interruptHandler(CONTEXT_SWITCH_IRQ);
                    }
                    break;

            }
        }
    },
    /**
     * Switches what pracess is to be run next
     * @public
     * @method switchContext
     */
    switchContext: function() {
        var self = this;

        var process = self.get("currentProcess");

        // Log our context switch
        _Kernel.trace("Switching Context");

        // set our process with appropraite values
        if (process.state !== "terminated") {
            process.set({
                pc: _CPU.pc,
                acc: _CPU.acc,
                xReg: _CPU.xReg,
                yReg: _CPU.yReg,
                zFlag: _CPU.zFlag,
                state: process.state !== "terminated" || process.state !== "in disk" ? "ready" : process.state
            });
        }

        // get the next process to execute from ready queue
        var nextProcess = self.readyQueue.dequeue();

        // if there is a process available then we'll set it to run
        if (nextProcess) {

            // Add the current process being passed to the ready queue
            if (process !== null && process.state !== "terminated")
                _CPU.scheduler.readyQueue.enqueue(process);

            // handle next process if from disk
            if (nextProcess.slot === -1) {
                if (!self.readyQueue.isEmpty() && _Kernel.memoryManager.findOpenSlot() === null) {
                    var processToRollOut = _Kernel.memoryManager.getProcessToRollOut();
                    _Kernel.memoryManager.rollOutProcess(processToRollOut);
                }
                _Kernel.memoryManager.rollInProcess(nextProcess);
            }



            // change our next process state to running
            nextProcess.set("state", "running");

            // set our current active process as well as previous
            self.set({
                previousProcess: process,
                currentProcess: nextProcess
            });

            // set active memory slot
            _Kernel.memoryManager.set("activeSlot", nextProcess.slot);

            // set the appropraite values of the CPU from our process to continue
            // executing
            _CPU.set({
                pc: nextProcess.pc,
                acc: nextProcess.acc,
                xReg: nextProcess.xReg,
                yReg: nextProcess.yReg,
                zFlag: nextProcess.zFlag,
                isExecuting: true
            });

        }
    }
});


/**
 *==============================================================================
 * Class MemoryManager
 *    
 * @class MemoryManager
 * @memberOf jambOS.OS
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.MemoryManager = jambOS.util.createClass({
    /**
     * @property {jambOS.host.Memory} memory
     */
    memory: null,
    /**
     * @property {string} type
     */
    type: "memorymanager",
    /**
     * @property {object} slots                 
     */
    slots: [],
    /**
     * @property {int} activeSlot
     */
    activeSlot: 0,
    /**
     * Constructor
     */
    initialize: function() {
        var self = this;

        // set up memory slots
        for (var i = 0; i < ALLOCATABLE_MEMORY_SLOTS; i++) {

            // for our bases we are going to use the previous slot's data
            // unless its the first slot which we'll use 0 as the base and 
            // the block size minus 1 as the limit
            var base = i > 0 ? self.slots[i - 1].limit + 1 : 0;
            var limit = i > 0 ? self.slots[ i - 1].limit + MEMORY_BLOCK_SIZE : MEMORY_BLOCK_SIZE - 1;

            self.slots.push({
                base: base,
                limit: limit,
                open: true
            });
        }

        // initialize our memory. We are going to use the last slot's limit + 1
        // as the total memory size
        var memorySize = self.slots[self.slots.length - 1].limit + 1;
        self.set({
            memory: new jambOS.host.Memory({size: memorySize})
        });

        // update memory table
        self.updateMemoryDisplay();
    },
    /**
     * Allocates memory slots to a process
     * @public
     * @method allocate
     * @param {jambOS.OS.ProcessControlBlock} pcb
     */
    allocate: function(pcb) {
        var self = this;
        var activeSlot = pcb.slot;

        if (activeSlot > 0) {
            self.slots[activeSlot].open = false;
            pcb.set({base: self.slots[activeSlot].base, limit: self.slots[activeSlot].limit});
            _CPU.scheduler.set("currentProcess", pcb);
        }
    },
    /**
     * Deallocates memory slots of a process
     * @public
     * @method deallocate
     * @param {jambOS.OS.ProcessControlBlock} pcb
     */
    deallocate: function(pcb) {
        var self = this;
        var slot = pcb.slot;

        // clear out process from memory
        for (var i = pcb.base; i <= pcb.limit; i++)
        {
            self.memory.write(i, "00");
        }

        // open our slot
        self.slots[slot].open = true;

        // set lowest posible slot as our active slot
        for (var key in self.slots) {
            if (self.slots[key].open) {
                self.activeSlot = key;
                break;
            }
        }

        // update memory table
        self.updateMemoryDisplay();
    },
    /**
     * Finds available slots in memory
     * @public
     * @method findOpenSlot
     * @returns {int} slot
     */
    findOpenSlot: function() {
        var self = this;

        // Find next available slot
        for (var key in self.slots) {
            if (self.slots[key].open) {
                return key;
            }
        }
        return null;
    },
    /**
     * Gets process to roll out of memory
     * @public
     * @method getProcessToRollOut
     * @returns {jambOS.OS.ProcessControlBlock} 
     */
    getProcessToRollOut: function() {
        var process = _CPU.scheduler.readyQueue.getLastProcess();
        return process;
    },
    /**
     * Rolls process into memory
     * @public
     * @method rollInProcess
     * @param {jambOS.OS.ProcessControlBlock} process
     */
    rollInProcess: function(process) {

        var self = this;
        var slot = self.findOpenSlot();
        process.set({
            base: self.slots[slot].base,
            limit: self.slots[slot].limit,
            slot: slot,
            state: "process loaded"
        });

        self.slots[slot].open = false;

        var programFile = "process_" + process.pid;

        // get program from memory
        var programFromDisk = _HardDrive.fileSystem.readFile(programFile, false).split(/\s/);

        // load new process to opened up slot
        _Kernel.memoryManager.memory.insert(process.base, programFromDisk);

        // allocate new process we are rolling in
        self.allocate(process);

        // delete file
        _HardDrive.fileSystem.deleteFile(programFile);
    },
    /**
     * Rolls process out of memory and into hard drive
     * @public
     * @method rollInProcess
     * @param {jambOS.OS.ProcessControlBlock} process
     */
    rollOutProcess: function(process) {

        var self = this;

        // get current program
        var currentProgram = self.getProgramFromMemory(process);
        
        console.log(currentProgram);
        
        // process to disk
        _HardDrive.fileSystem.createFile("process_" + process.pid);
        _HardDrive.fileSystem.writeFile("process_" + process.pid, currentProgram);

        self.slots[process.slot].open = true;

        // deallocate current process
        self.deallocate(process);

        process.set({state: "in disk", slot: -1});
    },
    /**
     * Gets program from memory
     * @public
     * @method getProgramFromMemory
     * @param {jambOS.OS.ProcessControlBlock} process
     * @returns {string} program
     */
    getProgramFromMemory: function(process) {
        var self = this;
        var start = process.base;
        var end = start + process.programSize;
        var program = "";

        for (var i = start; i < end; i++)
            program += self.memory.read(i);

        return program.match(/.{1,2}/g).join(" ");
    },
    /**
     * Validates if memory address is within available allocated slot
     * @public
     * @method validateAddress
     * @param {int} address 
     * @returns {boolean} isValid
     */
    validateAddress: function(address) {
        var self = this;
        var activeSlot = _CPU.scheduler.get("currentProcess").slot;

        var isValid = (address <= self.slots[activeSlot].limit && address >= self.slots[activeSlot].base);
        return isValid;
    },
    /**
     * Updates content that is on memory for display on the OS 
     * @public
     * @method updateDisplay
     */
    updateMemoryDisplay: function() {
        var self = this;
        var table = "<table class='table table-bordered'><tr>";
        var i = 0;
        while (self.memory.size > i) {
            if (i % 8 === 0) {
                table += "</tr><tr class='" + (self.memory.read(i) !== 0 ? "has-value" : "") + "'>";
                table += "<td>0x" + self.decimalToHex(i, 4) + "</td>";
                table += "<td class='operation operation_" + self.memory.read(i) + " address_" + i + "'>" + self.memory.read(i) + "</td>";
            } else
                table += "<td class='operation operation_" + self.memory.read(i) + " address_" + i + "'>" + self.memory.read(i) + "</td>";
            i++;
        }
        table += "</table>";

        // add to the memory div
        $("#memory .content").html(table);
    },
    /**
     * Converts decimal values to hex
     * @method decimalToHex
     * @param {Number} d
     * @param {int} padding
     * @returns {string} hex
     */
    decimalToHex: function(d, padding) {
        var hex = Number(d).toString(HEX_BASE);
        padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

        while (hex.length < padding) {
            hex = "0" + hex;
        }

        return hex.toUpperCase();
    }
});
/**
 *==============================================================================
 * Class ProcessManager
 *    
 * @class ProcessManager
 * @memberOf jambOS 
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.ProcessManager = jambOS.util.createClass({
    /**
     * @property {string} type
     */
    type: "processmanager",
    /**
     * Constructor
     * @param {object} options
     * @returns {jambOS.OS.ProcessManager}
     */
    initialize: function(options) {
        options || (options = {});
        this.setOptions(options);
        return this;
    },
    /**
     * Executes a process
     * @param {jambOS.OS.ProcessControlBlock} pcb
     */
    execute: function(pcb) {
        pcb.set("state", "ready");
        _Kernel.interruptHandler(PROCESS_INITIATION_IRQ, pcb);
    },
    /**
     * Loads program to memory
     * 
     * @param {string} program
     * @returns {jambOS.OS.ProcessControlBlock} pcb
     */
    load: function(program, priority) {
        
        if(isNaN(priority))
            priority = 0;

        // enable stepover button
        $("#btnStepOver").prop("disabled", false);

        var slots = _Kernel.memoryManager.get("slots");
        var activeSlot = _Kernel.memoryManager.get("activeSlot");

        // move up memory slot when program has been loaded
        if (activeSlot < ALLOCATABLE_MEMORY_SLOTS) {
            _Kernel.memoryManager.activeSlot++;

            // get our base and limit addresses
            var base = slots[activeSlot].base;
            var limit = slots[activeSlot].limit;

            var pcb = null;

            // write program to memory slots
            _Kernel.memoryManager.memory.insert(base, program);

            var pid = _CPU.scheduler.currentProcessID++;
            var pc = base;
            pcb = new jambOS.OS.ProcessControlBlock({
                pid: pid,
                pc: pc,
                base: base,
                limit: limit,
                xReg: 0,
                yReg: 0,
                zFlag: 0,
                slot: activeSlot,
                priority: priority,
                state: "new",
                programSize: program.length
            });
            _StdIn.putText("Process " + pid + " has been added to memory");

        } else {
            var pid = _CPU.scheduler.currentProcessID++;
            var pc = base;
            pcb = new jambOS.OS.ProcessControlBlock({
                pid: pid,
                xReg: 0,
                yReg: 0,
                zFlag: 0,
                slot: -1,
                state: "in disk",
                priority: priority,
                programSize: program.length
            });

            var filename = "process_" + pid;
            var data = program.join(" ");

            _HardDrive.fileSystem.createFile(filename);
            if (_HardDrive.fileSystem.writeFile(filename, data))
                _StdIn.putText("Process " + pid + " loaded to disk");
        }

        _CPU.scheduler.set("currentProcess", pcb);
        _CPU.scheduler.residentList.push(pcb);
        _Kernel.memoryManager.allocate(pcb);

        // sort resident list
        if (_CPU.scheduler.currentSchedulingAlgorithm === PRIORITY_SCHEDULER) {
            function compare(a, b) {
                if (a.priority < b.priority)
                    return -1;
                if (a.priority > b.priority)
                    return 1;
                return 0;
            }
            _CPU.scheduler.residentList.sort(compare);
            _CPU.scheduler.residentList.reverse();
        }
        return pcb;
    },
    /**
     * Unloads process from memoryhelp
     * @public
     * @method unload
     * @param {jambOS.OS.ProcessControlBlock} pcb
     */
    unload: function(pcb) {
        var self = this;

        var templist = [];

        // terminate programs in resident list
        $.each(_CPU.scheduler.residentList, function() {
            if (this.pid === pcb.pid) {
                this.set("state", "terminated");

                // deallocate memory of process
                _Kernel.memoryManager.deallocate(this);
            } else
                templist.push(this);
        });

        _CPU.scheduler.residentList = templist;

        // remove process from ready queue to remove zombie process effect
        $.each(_CPU.scheduler.readyQueue.q, function(i, process) {
            if (process.pid === pcb.pid)
                _CPU.scheduler.readyQueue.q.splice(i, 1);
        });

        // clear up the ready queue if we have no process in the residentlist
        if (!templist.length) {
            _CPU.scheduler.readyQueue.dequeue();
        }

        // we don't want to forget to reset the current process
        if (self.get("currentProcess") && self.get("currentProcess").pid === pcb.pid)
            self.set("currentProcess", null);
    },
    /**
     * Updates cpu status display
     * @public
     * @method updateCpuStatusDisplay
     * @param {jambOS.host.Cpu} cpu
     */
    updateCpuStatusDisplay: function(cpu) {
        var pc = cpu.pc;
        var acc = cpu.acc;
        var xReg = cpu.xReg;
        var yReg = parseInt(cpu.yReg, 16);
        var zFlag = cpu.zFlag;

        $("#cpuStatus .pc").text(pc);
        $("#cpuStatus .acc").text(acc);
        $("#cpuStatus .x-register").text(xReg);
        $("#cpuStatus .y-register").text(yReg);
        $("#cpuStatus .z-flag").text(zFlag);

    },
    /**
     * Updates the process status table results
     * @public
     * @method updatePCBStatusDisplay
     * @param {boolean} isDone - Has cpu completed executing processes? TODO: Find a way to utilize cpu.isExecuting
     */
    updatePCBStatusDisplay: function(isDone) {
        var self = this;
        var tableRows = "";
        var currentProcess = jambOS.util.clone(_CPU.scheduler.get("currentProcess"));
        var pcbs = $.map(jambOS.util.clone(_CPU.scheduler.residentList), function(value, index) {
            return [value];
        });

        // checks if current process is in the ready queue
        var isInReadyQueue = (function(pcb) {
            $.each(pcbs, function() {
                if (this.pid === pcb.pid)
                    return true;
            });

            return false;
        })(currentProcess);

        /*  if (_CPU.isExecuting && !isInReadyQueue)
         pcbs.push(currentProcess);
         else */if (isDone) {
            pcbs = [];

            // clear process status table and populate data
            $("#pcbStatus table tbody").empty().append("<tr><td colspan='6'><strong>No processes available</strong></td></tr>");

        }

        // loop through the ready queue and get all processes that are ready to
        // be executed
        $.each(pcbs.reverse(), function() {
            var process = this;
            var id = process.pid;
            var pc = process.pc;
            var acc = process.acc;
            var xReg = process.xReg;
            var yReg = parseInt(process.yReg, 16);
            var zFlag = process.zFlag;
            var status = process.state;

            tableRows += "<tr class='" + (currentProcess.pid === process.pid ? "active" : "") + "'>\n\
                                <td>\n\
                                    " + id + "\n\
                                </td>\n\
                                <td>\n\
                                    " + (currentProcess.pid === process.pid ? _CPU.pc : pc) + "\n\
                                </td>\n\
                                <td>\n\
                                    " + acc + "\n\
                                </td>\n\
                                <td>\n\
                                    " + xReg + "\n\
                                </td>\n\
                                <td>\n\
                                    " + yReg + "\n\
                                </td>\n\
                                <td>\n\
                                    " + zFlag + "\n\
                                </td>\n\
                                <td>\n\
                                    " + status + "\n\
                                </td>\n\
                              </tr>";

            // clear process status table and populate data
            $("#pcbStatus table tbody").empty().append(tableRows);
        });

    }
});

/**
 * =============================================================================
 * interrupt.class.js 
 * 
 * Interrupt Class
 * 
 * @public
 * @class Interrupt
 * @memberOf jambOS.OS
 * =============================================================================
 */

jambOS.OS.Interrupt = jambOS.util.createClass(/** @scope jambOS.OS.Interrupt.prototype */{
    /**
     * @property {string} type
     */
    type: "Interrupt",
    /**
     * @property {int} iqr
     */
    irq: null,
    /**
     * @params {object} params
     */
    params: null,
    /**
     * Constructor
     */
    initialize: function(options) {
        var self = this;

        options || (options = {});
        self.setOptions(options);
    }
});
/* ----------------- *
 *   CanvasText.js   *
 *
 * Downloaded from http://www.federated.com/~jim/canvastext.
 *
 * This code is released to the public domain by Jim Studt, 2007.
 * He may keep some sort of up to date copy at http://www.federated.com/~jim/canvastext/
 *
 * Modifications by Alan G. Labouseur.
 *  - fixed comma
 *  - added semi-colon.
 *
 * ----------------- */

var CanvasTextFunctions = { };

CanvasTextFunctions.letters = {
    ' ': { width: 16, points: [] },
    '!': { width: 10, points: [[5,21],[5,7],[-1,-1],[5,2],[4,1],[5,0],[6,1],[5,2]] },
    '"': { width: 16, points: [[4,21],[4,14],[-1,-1],[12,21],[12,14]] },
    '#': { width: 21, points: [[11,25],[4,-7],[-1,-1],[17,25],[10,-7],[-1,-1],[4,12],[18,12],[-1,-1],[3,6],[17,6]] },
    '$': { width: 20, points: [[8,25],[8,-4],[-1,-1],[12,25],[12,-4],[-1,-1],[17,18],[15,20],[12,21],[8,21],[5,20],[3,18],[3,16],[4,14],[5,13],[7,12],[13,10],[15,9],[16,8],[17,6],[17,3],[15,1],[12,0],[8,0],[5,1],[3,3]] },
    '%': { width: 24, points: [[21,21],[3,0],[-1,-1],[8,21],[10,19],[10,17],[9,15],[7,14],[5,14],[3,16],[3,18],[4,20],[6,21],[8,21],[10,20],[13,19],[16,19],[19,20],[21,21],[-1,-1],[17,7],[15,6],[14,4],[14,2],[16,0],[18,0],[20,1],[21,3],[21,5],[19,7],[17,7]] },
    '&': { width: 26, points: [[23,12],[23,13],[22,14],[21,14],[20,13],[19,11],[17,6],[15,3],[13,1],[11,0],[7,0],[5,1],[4,2],[3,4],[3,6],[4,8],[5,9],[12,13],[13,14],[14,16],[14,18],[13,20],[11,21],[9,20],[8,18],[8,16],[9,13],[11,10],[16,3],[18,1],[20,0],[22,0],[23,1],[23,2]] },
    '\'': { width: 10, points: [[5,19],[4,20],[5,21],[6,20],[6,18],[5,16],[4,15]] },
    '(': { width: 14, points: [[11,25],[9,23],[7,20],[5,16],[4,11],[4,7],[5,2],[7,-2],[9,-5],[11,-7]] },
    ')': { width: 14, points: [[3,25],[5,23],[7,20],[9,16],[10,11],[10,7],[9,2],[7,-2],[5,-5],[3,-7]] },
    '*': { width: 16, points: [[8,21],[8,9],[-1,-1],[3,18],[13,12],[-1,-1],[13,18],[3,12]] },
    '+': { width: 26, points: [[13,18],[13,0],[-1,-1],[4,9],[22,9]] },

    '-': { width: 26, points: [[4,9],[22,9]] },
    '.': { width: 10, points: [[5,2],[4,1],[5,0],[6,1],[5,2]] },
    '/': { width: 22, points: [[20,25],[2,-7]] },
    '0': { width: 20, points: [[9,21],[6,20],[4,17],[3,12],[3,9],[4,4],[6,1],[9,0],[11,0],[14,1],[16,4],[17,9],[17,12],[16,17],[14,20],[11,21],[9,21]] },
    '1': { width: 20, points: [[6,17],[8,18],[11,21],[11,0]] },
    '2': { width: 20, points: [[4,16],[4,17],[5,19],[6,20],[8,21],[12,21],[14,20],[15,19],[16,17],[16,15],[15,13],[13,10],[3,0],[17,0]] },
    '3': { width: 20, points: [[5,21],[16,21],[10,13],[13,13],[15,12],[16,11],[17,8],[17,6],[16,3],[14,1],[11,0],[8,0],[5,1],[4,2],[3,4]] },
    '4': { width: 20, points: [[13,21],[3,7],[18,7],[-1,-1],[13,21],[13,0]] },
    '5': { width: 20, points: [[15,21],[5,21],[4,12],[5,13],[8,14],[11,14],[14,13],[16,11],[17,8],[17,6],[16,3],[14,1],[11,0],[8,0],[5,1],[4,2],[3,4]] },
    '6': { width: 20, points: [[16,18],[15,20],[12,21],[10,21],[7,20],[5,17],[4,12],[4,7],[5,3],[7,1],[10,0],[11,0],[14,1],[16,3],[17,6],[17,7],[16,10],[14,12],[11,13],[10,13],[7,12],[5,10],[4,7]] },
    '7': { width: 20, points: [[17,21],[7,0],[-1,-1],[3,21],[17,21]] },
    '8': { width: 20, points: [[8,21],[5,20],[4,18],[4,16],[5,14],[7,13],[11,12],[14,11],[16,9],[17,7],[17,4],[16,2],[15,1],[12,0],[8,0],[5,1],[4,2],[3,4],[3,7],[4,9],[6,11],[9,12],[13,13],[15,14],[16,16],[16,18],[15,20],[12,21],[8,21]] },
    '9': { width: 20, points: [[16,14],[15,11],[13,9],[10,8],[9,8],[6,9],[4,11],[3,14],[3,15],[4,18],[6,20],[9,21],[10,21],[13,20],[15,18],[16,14],[16,9],[15,4],[13,1],[10,0],[8,0],[5,1],[4,3]] },
    ':': { width: 10, points: [[5,14],[4,13],[5,12],[6,13],[5,14],[-1,-1],[5,2],[4,1],[5,0],[6,1],[5,2]] },
    ',': { width: 10, points: [[6,1],[5,0],[4,1],[5,2],[6,1],[6,-1],[5,-3],[4,-4]] },
    ';': { width: 10, points: [[5,14],[4,13],[5,12],[6,13],[5,14],[-1,-1],[6,1],[5,0],[4,1],[5,2],[6,1],[6,-1],[5,-3],[4,-4]] },
    '<': { width: 24, points: [[20,18],[4,9],[20,0]] },
    '=': { width: 26, points: [[4,12],[22,12],[-1,-1],[4,6],[22,6]] },
    '>': { width: 24, points: [[4,18],[20,9],[4,0]] },
    '?': { width: 18, points: [[3,16],[3,17],[4,19],[5,20],[7,21],[11,21],[13,20],[14,19],[15,17],[15,15],[14,13],[13,12],[9,10],[9,7],[-1,-1],[9,2],[8,1],[9,0],[10,1],[9,2]] },
    '@': { width: 27, points: [[18,13],[17,15],[15,16],[12,16],[10,15],[9,14],[8,11],[8,8],[9,6],[11,5],[14,5],[16,6],[17,8],[-1,-1],[12,16],[10,14],[9,11],[9,8],[10,6],[11,5],[-1,-1],[18,16],[17,8],[17,6],[19,5],[21,5],[23,7],[24,10],[24,12],[23,15],[22,17],[20,19],[18,20],[15,21],[12,21],[9,20],[7,19],[5,17],[4,15],[3,12],[3,9],[4,6],[5,4],[7,2],[9,1],[12,0],[15,0],[18,1],[20,2],[21,3],[-1,-1],[19,16],[18,8],[18,6],[19,5]] },
    'A': { width: 18, points: [[9,21],[1,0],[-1,-1],[9,21],[17,0],[-1,-1],[4,7],[14,7]] },
    'B': { width: 21, points: [[4,21],[4,0],[-1,-1],[4,21],[13,21],[16,20],[17,19],[18,17],[18,15],[17,13],[16,12],[13,11],[-1,-1],[4,11],[13,11],[16,10],[17,9],[18,7],[18,4],[17,2],[16,1],[13,0],[4,0]] },
    'C': { width: 21, points: [[18,16],[17,18],[15,20],[13,21],[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5]] },
    'D': { width: 21, points: [[4,21],[4,0],[-1,-1],[4,21],[11,21],[14,20],[16,18],[17,16],[18,13],[18,8],[17,5],[16,3],[14,1],[11,0],[4,0]] },
    'E': { width: 19, points: [[4,21],[4,0],[-1,-1],[4,21],[17,21],[-1,-1],[4,11],[12,11],[-1,-1],[4,0],[17,0]] },
    'F': { width: 18, points: [[4,21],[4,0],[-1,-1],[4,21],[17,21],[-1,-1],[4,11],[12,11]] },
    'G': { width: 21, points: [[18,16],[17,18],[15,20],[13,21],[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5],[18,8],[-1,-1],[13,8],[18,8]] },
    'H': { width: 22, points: [[4,21],[4,0],[-1,-1],[18,21],[18,0],[-1,-1],[4,11],[18,11]] },
    'I': { width: 8, points: [[4,21],[4,0]] },
    'J': { width: 16, points: [[12,21],[12,5],[11,2],[10,1],[8,0],[6,0],[4,1],[3,2],[2,5],[2,7]] },
    'K': { width: 21, points: [[4,21],[4,0],[-1,-1],[18,21],[4,7],[-1,-1],[9,12],[18,0]] },
    'L': { width: 17, points: [[4,21],[4,0],[-1,-1],[4,0],[16,0]] },
    'M': { width: 24, points: [[4,21],[4,0],[-1,-1],[4,21],[12,0],[-1,-1],[20,21],[12,0],[-1,-1],[20,21],[20,0]] },
    'N': { width: 22, points: [[4,21],[4,0],[-1,-1],[4,21],[18,0],[-1,-1],[18,21],[18,0]] },
    'O': { width: 22, points: [[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5],[19,8],[19,13],[18,16],[17,18],[15,20],[13,21],[9,21]] },
    'P': { width: 21, points: [[4,21],[4,0],[-1,-1],[4,21],[13,21],[16,20],[17,19],[18,17],[18,14],[17,12],[16,11],[13,10],[4,10]] },
    'Q': { width: 22, points: [[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5],[19,8],[19,13],[18,16],[17,18],[15,20],[13,21],[9,21],[-1,-1],[12,4],[18,-2]] },
    'R': { width: 21, points: [[4,21],[4,0],[-1,-1],[4,21],[13,21],[16,20],[17,19],[18,17],[18,15],[17,13],[16,12],[13,11],[4,11],[-1,-1],[11,11],[18,0]] },
    'S': { width: 20, points: [[17,18],[15,20],[12,21],[8,21],[5,20],[3,18],[3,16],[4,14],[5,13],[7,12],[13,10],[15,9],[16,8],[17,6],[17,3],[15,1],[12,0],[8,0],[5,1],[3,3]] },
    'T': { width: 16, points: [[8,21],[8,0],[-1,-1],[1,21],[15,21]] },
    'U': { width: 22, points: [[4,21],[4,6],[5,3],[7,1],[10,0],[12,0],[15,1],[17,3],[18,6],[18,21]] },
    'V': { width: 18, points: [[1,21],[9,0],[-1,-1],[17,21],[9,0]] },
    'W': { width: 24, points: [[2,21],[7,0],[-1,-1],[12,21],[7,0],[-1,-1],[12,21],[17,0],[-1,-1],[22,21],[17,0]] },
    'X': { width: 20, points: [[3,21],[17,0],[-1,-1],[17,21],[3,0]] },
    'Y': { width: 18, points: [[1,21],[9,11],[9,0],[-1,-1],[17,21],[9,11]] },
    'Z': { width: 20, points: [[17,21],[3,0],[-1,-1],[3,21],[17,21],[-1,-1],[3,0],[17,0]] },
    '[': { width: 14, points: [[4,25],[4,-7],[-1,-1],[5,25],[5,-7],[-1,-1],[4,25],[11,25],[-1,-1],[4,-7],[11,-7]] },
    '\\': { width: 14, points: [[0,21],[14,-3]] },
    ']': { width: 14, points: [[9,25],[9,-7],[-1,-1],[10,25],[10,-7],[-1,-1],[3,25],[10,25],[-1,-1],[3,-7],[10,-7]] },
    '^': { width: 16, points: [[6,15],[8,18],[10,15],[-1,-1],[3,12],[8,17],[13,12],[-1,-1],[8,17],[8,0]] },
    '_': { width: 16, points: [[0,-2],[16,-2]] },
    '`': { width: 10, points: [[6,21],[5,20],[4,18],[4,16],[5,15],[6,16],[5,17]] },
    'a': { width: 19, points: [[15,14],[15,0],[-1,-1],[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]] },
    'b': { width: 19, points: [[4,21],[4,0],[-1,-1],[4,11],[6,13],[8,14],[11,14],[13,13],[15,11],[16,8],[16,6],[15,3],[13,1],[11,0],[8,0],[6,1],[4,3]] },
    'c': { width: 18, points: [[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]] },
    'd': { width: 19, points: [[15,21],[15,0],[-1,-1],[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]] },
    'e': { width: 18, points: [[3,8],[15,8],[15,10],[14,12],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]] },
    'f': { width: 12, points: [[10,21],[8,21],[6,20],[5,17],[5,0],[-1,-1],[2,14],[9,14]] },
    'g': { width: 19, points: [[15,14],[15,-2],[14,-5],[13,-6],[11,-7],[8,-7],[6,-6],[-1,-1],[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]] },
    'h': { width: 19, points: [[4,21],[4,0],[-1,-1],[4,10],[7,13],[9,14],[12,14],[14,13],[15,10],[15,0]] },
    'i': { width: 8, points: [[3,21],[4,20],[5,21],[4,22],[3,21],[-1,-1],[4,14],[4,0]] },
    'j': { width: 10, points: [[5,21],[6,20],[7,21],[6,22],[5,21],[-1,-1],[6,14],[6,-3],[5,-6],[3,-7],[1,-7]] },
    'k': { width: 17, points: [[4,21],[4,0],[-1,-1],[14,14],[4,4],[-1,-1],[8,8],[15,0]] },
    'l': { width: 8, points: [[4,21],[4,0]] },
    'm': { width: 30, points: [[4,14],[4,0],[-1,-1],[4,10],[7,13],[9,14],[12,14],[14,13],[15,10],[15,0],[-1,-1],[15,10],[18,13],[20,14],[23,14],[25,13],[26,10],[26,0]] },
    'n': { width: 19, points: [[4,14],[4,0],[-1,-1],[4,10],[7,13],[9,14],[12,14],[14,13],[15,10],[15,0]] },
    'o': { width: 19, points: [[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3],[16,6],[16,8],[15,11],[13,13],[11,14],[8,14]] },
    'p': { width: 19, points: [[4,14],[4,-7],[-1,-1],[4,11],[6,13],[8,14],[11,14],[13,13],[15,11],[16,8],[16,6],[15,3],[13,1],[11,0],[8,0],[6,1],[4,3]] },
    'q': { width: 19, points: [[15,14],[15,-7],[-1,-1],[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]] },
    'r': { width: 13, points: [[4,14],[4,0],[-1,-1],[4,8],[5,11],[7,13],[9,14],[12,14]] },
    's': { width: 17, points: [[14,11],[13,13],[10,14],[7,14],[4,13],[3,11],[4,9],[6,8],[11,7],[13,6],[14,4],[14,3],[13,1],[10,0],[7,0],[4,1],[3,3]] },
    't': { width: 12, points: [[5,21],[5,4],[6,1],[8,0],[10,0],[-1,-1],[2,14],[9,14]] },
    'u': { width: 19, points: [[4,14],[4,4],[5,1],[7,0],[10,0],[12,1],[15,4],[-1,-1],[15,14],[15,0]] },
    'v': { width: 16, points: [[2,14],[8,0],[-1,-1],[14,14],[8,0]] },
    'w': { width: 22, points: [[3,14],[7,0],[-1,-1],[11,14],[7,0],[-1,-1],[11,14],[15,0],[-1,-1],[19,14],[15,0]] },
    'x': { width: 17, points: [[3,14],[14,0],[-1,-1],[14,14],[3,0]] },
    'y': { width: 16, points: [[2,14],[8,0],[-1,-1],[14,14],[8,0],[6,-4],[4,-6],[2,-7],[1,-7]] },
    'z': { width: 17, points: [[14,14],[3,0],[-1,-1],[3,14],[14,14],[-1,-1],[3,0],[14,0]] },
    '{': { width: 14, points: [[9,25],[7,24],[6,23],[5,21],[5,19],[6,17],[7,16],[8,14],[8,12],[6,10],[-1,-1],[7,24],[6,22],[6,20],[7,18],[8,17],[9,15],[9,13],[8,11],[4,9],[8,7],[9,5],[9,3],[8,1],[7,0],[6,-2],[6,-4],[7,-6],[-1,-1],[6,8],[8,6],[8,4],[7,2],[6,1],[5,-1],[5,-3],[6,-5],[7,-6],[9,-7]] },
    '|': { width: 8, points: [[4,25],[4,-7]] },
    '}': { width: 14, points: [[5,25],[7,24],[8,23],[9,21],[9,19],[8,17],[7,16],[6,14],[6,12],[8,10],[-1,-1],[7,24],[8,22],[8,20],[7,18],[6,17],[5,15],[5,13],[6,11],[10,9],[6,7],[5,5],[5,3],[6,1],[7,0],[8,-2],[8,-4],[7,-6],[-1,-1],[8,8],[6,6],[6,4],[7,2],[8,1],[9,-1],[9,-3],[8,-5],[7,-6],[5,-7]] },
    '~': { width: 24, points: [[3,6],[3,8],[4,11],[6,12],[8,12],[10,11],[14,8],[16,7],[18,7],[20,8],[21,10],[-1,-1],[3,8],[4,10],[6,11],[8,11],[10,10],[14,7],[16,6],[18,6],[20,7],[21,10],[21,12]] }
};

CanvasTextFunctions.letter = function (ch) 
{
    return CanvasTextFunctions.letters[ch];
};

CanvasTextFunctions.ascent = function(font, size) 
{
    return size;
};

CanvasTextFunctions.descent = function(font, size) 
{
    return 7.0*size/25.0;
};

CanvasTextFunctions.measure = function(font, size, str) 
{
    var total = 0;
    var len = str.length;

    for (var i = 0; i < len; i++) 
	{
		var c = CanvasTextFunctions.letter(str.charAt(i));
		if (c) 
		{
			total += c.width * size / 25.0;
		}
    }
    return total;
};

CanvasTextFunctions.draw = function(ctx,font,size,x,y,str) 
{
    var total = 0;
    var len = str.length;
    var mag = size / 25.0;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 2.0 * mag;
	ctx.strokeStyle = "black";

    for (var i = 0; i < len; i++) 
	{
		var c = CanvasTextFunctions.letter( str.charAt(i));
		if (!c)
		{
			continue;	
		} 
		ctx.beginPath();
		var penUp = 1;
		var needStroke = 0;
		for (var j = 0; j < c.points.length; j++) 
		{
		    var a = c.points[j];
		    if ( a[0] === -1 && a[1] === -1) 
			{
				penUp = 1;
				continue;
		    }
		    if ( penUp) 
			{
				ctx.moveTo( x + a[0]*mag, y - a[1]*mag);
				penUp = false;
		    } 
			else 
			{
				ctx.lineTo( x + a[0]*mag, y - a[1]*mag);
		    }
		}
		ctx.stroke();
		x += c.width*mag;
    }
    ctx.restore();
    return total;
};

CanvasTextFunctions.enable = function(ctx) 
{
    ctx.drawText = function(font,size,x,y,text) { return CanvasTextFunctions.draw( ctx, font,size,x,y,text); };
    ctx.measureText = function(font,size,text) { return CanvasTextFunctions.measure( font,size,text); };
    ctx.fontAscent = function(font,size) { return CanvasTextFunctions.ascent(font,size); };
    ctx.fontDescent = function(font,size) { return CanvasTextFunctions.descent(font,size); };
    ctx.drawTextRight = function(font,size,x,y,text) {  
		var w = CanvasTextFunctions.measure(font,size,text);
		return CanvasTextFunctions.draw( ctx, font,size,x-w,y,text); 
    };
    ctx.drawTextCenter = function(font,size,x,y,text) { 
		var w = CanvasTextFunctions.measure(font,size,text);
		return CanvasTextFunctions.draw( ctx, font,size,x-w/2,y,text); 
    };
};

/**
 * =============================================================================
 * Console.js 
 * 
 * The OS Console - stdIn and stdOut by default.
 * Note: This is not the Shell.  The Shell is the "command line interface" (CLI) 
 * or interpreter for this console.
 * 
 * @requires globals.js
 * @public
 * @class Console
 * @memberOf jambOS.OS
 * =============================================================================
 */

jambOS.OS.Console = jambOS.util.createClass(/** @scope jambOS.OS.Console.prototype */{
    /**
     * @property {string}   buffer          - Contains the current typed data
     */
    buffer: "",
    /**
     * @property {string}   currentFont     - current font family
     */
    currentFont: _DefaultFontFamily,
    /**
     * @property {int}      currentFontSize - current fontsize
     */
    currentFontSize: _DefaultFontSize,
    /**
     * @property {int}      currentXPosition - current x position
     */
    currentXPosition: 0,
    /**
     * @property {int}      currentYPosition - current y position
     */
    currentYPosition: _DefaultFontSize,
    lastXPosition: 0,
    lastYPosition: _DefaultFontSize,
    linesAdvanced: 0,
    /**
     * Constructor
     */
    initialize: function() {
        this.clearScreen();
        this.resetXY();
        this.initTaskbar();
        this.initCursor();
    },
    /**
     * Initializes our taskbar
     * @public
     * @method initTaskbar
     */
    initTaskbar: function() {
        var date = new Date();
        var date_xpos = 16;
        var date_ypos = 16;
        var status_xpos = 200;
        var status_ypos = 16;
        _TaskbarContext.font = "bold 12px Arial";
        _TaskbarContext.fillText(date.toLocaleString(), date_xpos, date_ypos);
        _TaskbarContext.fillText("Status: OS is running...", status_xpos, status_ypos);

        // redraw section every second
        window.setInterval(function() {
            date = new Date();
            var clearWidth = 165;
            var clearHeight = 20;

            // only readraw when OS is running
            if (_IsOSRunning) {
                _TaskbarContext.clearRect(date_xpos, 0, clearWidth, clearHeight);
                _TaskbarContext.fillText(date.toLocaleString(), date_xpos, date_ypos);
            } else {
                _TaskbarContext.clearRect(status_xpos, 0, 400, 20);
                _TaskbarContext.fillText("Status: OS has halted", status_xpos, status_ypos);
            }
        }, 1000);
    },
    /**
     * Handlers the cursor on the canvas
     * @public
     * @method initCursor
     */
    initCursor: function() {

        var self = this;

        // blinking cursor
        window.setInterval(function() {

            if (!_IsTyping && _StdIn && $("#display").is(":focus")) {

                _DrawingContext.drawText(_Console.currentFont, _Console.currentFontSize, _Console.currentXPosition, _Console.currentYPosition, "|");

                setTimeout(function() {
                    self.clearBlinker();
                }, 500);
            }
        }, 1000);
    },
    /**
     * Clears the canvas
     * @public
     * @method clearScreen
     */
    clearScreen: function() {
        _Canvas.height = 480;
        _DrawingContext.clearRect(0, 0, _Canvas.width, _Canvas.height);
    },
    /**
     * Helps with clearing the cursor blinker
     * @public
     * @method clearBlinlker
     */
    clearBlinker: function() {
        var xPos = this.currentXPosition;
        var yPos = (this.currentYPosition - this.currentFontSize) - 1;
        var height = this.currentFontSize + (this.currentFontSize / 2);
        _DrawingContext.clearRect(xPos, yPos, _Canvas.width, height);
    },
    /**
     * Resets the X & Y positions of the cursor
     * @public
     * @method resetXY
     */
    resetXY: function() {
        this.currentXPosition = 0;
        this.currentYPosition = this.currentFontSize + 5;
    },
    /**
     * Handles console input
     * @public
     * @method handleInput
     */
    handleInput: function() {
        while (_KernelInputQueue.getSize() > 0)
        {
            // Get the next character from the kernel input queue.
            var chr = _KernelInputQueue.dequeue();
            // Check to see if it's "special" (enter or ctrl-c) or "normal" (anything else that the keyboard device driver gave us).
            if (chr === String.fromCharCode(13))  //     Enter key
            {
                // The enter key marks the end of a console command, so ...
                // ... tell the shell ...
                _OsShell.handleInput(this.buffer);
                // ... and reset our buffer.
                this.buffer = "";
            }
            // TODO: Write a case for Ctrl-C.
            else
            {
                // This is a "normal" character, so ...
                // ... draw it on the screen...
                this.putText(chr);
                // ... and add it to our buffer.
                this.buffer += chr;
            }
        }
    },
    /**
     * Outputs text on the canvas console
     * @public
     * @method putText
     * @param {string} text         - Text that will be outputted on the console
     */
    putText: function(text) {
        // My first inclination here was to write two functions: putChar() and putString().
        // Then I remembered that JavaScript is (sadly) untyped and it won't differentiate
        // between the two.  So rather than be like PHP and write two (or more) functions that
        // do the same thing, thereby encouraging confusion and decreasing readability, I
        // decided to write one function and use the term "text" to connote string or char.
        if (text !== "")
        {
            // clear blinker before drawing character
            this.clearBlinker();

            // Draw the text at the current X and Y coordinates.
            _DrawingContext.drawText(this.currentFont, this.currentFontSize, this.currentXPosition, this.currentYPosition, text);

            // handle wrapping of text
            if (this.currentXPosition > _Canvas.width) {
                this.lastXPosition = this.currentXPosition;
                this.lastYPosition = this.currentYPosition;
                this.linesAdvanced += 1;
                this.advanceLine();
            } else {

                var offset = _DrawingContext.measureText(this.currentFont, this.currentFontSize, text);

                // Move the current X position.
                this.currentXPosition += offset;
            }
        }

        // reset our isTyping variable so that we can show our cursor
        _isTyping = false;
    },
    /**
     * Handles new line advancement of the cursor
     * @public
     * @method advanceLine
     */
    advanceLine: function() {

        // clear blinker before we get screenshot of canvas
        this.clearBlinker();

        // get our prompt offset that way we can make sure we are within the editable bounds
        var promptOffset = _DrawingContext.measureText(this.currentFont, this.currentFontSize, ">");
        this.currentXPosition = 0;
        this.currentYPosition += _DefaultFontSize + _FontHeightMargin;

        // Handle scrolling.
        if (this.currentYPosition > _Canvas.height) {
            var bufferCanvas = document.createElement('canvas');
            var buffer = bufferCanvas.getContext("2d");

            bufferCanvas.style.diplay = "none";
            bufferCanvas.width = _Canvas.width;
            bufferCanvas.height = _Canvas.height;

            var canvasData = _DrawingContext.getImageData(0, 0, _Canvas.width, _Canvas.height);

            // draw current canvas image on buffer
            buffer.putImageData(canvasData, 0, 0);

            canvasData = buffer.getImageData(0, 0, _Canvas.width, _Canvas.height);

            _Canvas.height += _DefaultFontSize + _FontHeightMargin;

            // redraw everything on the resized canvas
            _DrawingContext.putImageData(canvasData, 0, 0);

            // scroll to the bottom
            var consoleDiv = $("#divConsole .canvas");
            consoleDiv.scrollTop(consoleDiv.find("canvas").height());
        }
    }
});
/**
 * =============================================================================
 * deviceDriver.js 
 * 
 * Base class for all Device Drivers
 * 
 * @public
 * @class DeviceDriver
 * @memberOf jambOS.OS
 * =============================================================================
 */

jambOS.OS.DeviceDriver = jambOS.util.createClass({
    /**
     * @property {string} version
     */
    version: "1.00",
    /**
     * @property {string} status
     */
    status: "unloaded",
    /**
     * @property {boolean} preemptable
     */
    preemptable: false,
    // TODO: We will eventually want a queue for, well, queueing requests for this device to be handled by deferred procedure calls (DPCs).
    // queue: new jambOS.OS.Queue(),     

    // Base Method pointers.
    /**
     * Initialization routine.  Should be called when the driver is loaded.
     */
    driverEntry: null,
    /**
     * Interrupt Service Routine
     */
    isr: null,
    // TODO: Deferred Procedure Call routine - Start next queued operation on this device.
    dpc: null
});

/**
 * =============================================================================
 * deviceDriverKeyboard.js 
 * 
 * The Kernel Keyboard Device Driver.
 * "Inherit" from DeviceDriver in deviceDriver.js.
 * Add or override specific attributes and method pointers.
 * 
 * @public
 * @inheritsFrom DeviceDriver
 * @class DeviceDriverKeyboard
 * @memberOf jambOS.OS
 * =============================================================================
 */

jambOS.OS.DeviceDriverKeyboard = jambOS.util.createClass(jambOS.OS.DeviceDriver, /** @scope jambOS.OS.DeviceDriverKeyboard.prototype*/{
    // this.buffer = "";    // TODO: Do we need this?
    /**
     * Constructor
     */
    initialize: function() {

    },
    // Override the base method pointers.
    /**
     * Initialization routine for this, the kernel-mode Keyboard Device Driver.
     */
    driverEntry: function()
    {
        this.status = "loaded";
        // More?
    },
    /**
     * Interupt Service Routine
     * @public
     * @method isr
     * @param {object} params
     */
    isr: function(params)
    {
        // Parse the params.
        var keyCode = params[0];
        var isShifted = params[1];

        // Check that they are valid and osTrapError if not.
        var valid = ((keyCode >= 48) && (keyCode <= 57)) || // digits 
                ((keyCode >= 65) && (keyCode <= 90)) || // A..Z
                ((keyCode >= 97) && (keyCode <= 123)) || // a..z
                (keyCode === 32) || // space
                (keyCode === 13) || // enter
                (keyCode === 8) || // backspace
                (keyCode === 38) || // up
                (keyCode === 40) || // down
                (keyCode >= 186) && (keyCode <= 192) || // punctuation characters
                (keyCode >= 219 && (keyCode <= 222)) || // punctuation characters
                keyCode === 16 || // shift
                keyCode === 20 || // Caps-Lock
                keyCode === 8;  // backspace    

        if (!valid) {
            // throw an error but do not kill the OS
            _Kernel.trapError("Oh bummer, I wish I could have had some use for that key! :(", false);
        }


        _Kernel.trace("Key code:" + keyCode + " shifted:" + isShifted);
        var chr = "";

        // Check to see if we even want to deal with the key that was pressed.
        if (((keyCode >= 65) && (keyCode <= 90)) || // A..Z
                ((keyCode >= 97) && (keyCode <= 123)))   // a..z
        {
            // Determine the character we want to display.  
            // Assume it's lowercase...
            chr = String.fromCharCode(keyCode + 32);

            // ... then check the shift key and re-adjust if necessary.
            // TODO: Check for caps-lock and handle as shifted if so.
            if (isShifted)
            {
                chr = String.fromCharCode(keyCode);
            }

            _KernelInputQueue.enqueue(chr);
        }
        else if (((keyCode >= 48) && (keyCode <= 57)) || // digits 
                (keyCode === 32) || // space
                (keyCode === 13) || // enter
                (keyCode === 8) || // backspace
                (keyCode === 38) || // up
                (keyCode === 40) || // down
                (keyCode >= 186) && (keyCode <= 192) ||
                (keyCode >= 219 && (keyCode <= 222)))
        {

            chr = String.fromCharCode(keyCode);

            //==========================================//
            // Handle panctuations
            //==========================================//
            // exclamation-mark
            if (keyCode === 49 && isShifted)
                chr = "!";

            // at-symbol
            if (keyCode === 50 && isShifted)
                chr = "@";

            // hash
            if (keyCode === 51 && isShifted)
                chr = "#";

            // dollar-sign
            if (keyCode === 52 && isShifted)
                chr = "$";

            // percent    
            if (keyCode === 53 && isShifted)
                chr = "%";

            // caret        
            if (keyCode === 54 && isShifted)
                chr = "^";

            // and-percent        
            if (keyCode === 55 && isShifted)
                chr = "&";

            // asterik     
            if (keyCode === 56 && isShifted)
                chr = "*";


            // open-parenthesis        
            if (keyCode === 57 && isShifted)
                chr = "(";

            // close-parenthesis
            if (keyCode === 48 && isShifted)
                chr = ")";

            // semi-colon & colon
            if (keyCode === 186 && !isShifted)
                chr = ";";
            else if (keyCode === 186 && isShifted)
                chr = ":";

            // equal-sign & plus
            if (keyCode === 187 && !isShifted)
                chr = "=";
            else if (keyCode === 187 && isShifted)
                chr = "+";

            // coma & less-than
            if (keyCode === 188 && !isShifted)
                chr = ",";
            else if (keyCode === 188 && isShifted)
                chr = "<";

            // dash & underscore
            if (keyCode === 189 && !isShifted)
                chr = "-";
            else if (keyCode === 189 && isShifted)
                chr = "_";

            // period & greater-than
            if (keyCode === 190 && !isShifted)
                chr = ".";
            else if (keyCode === 190 && isShifted)
                chr = ">";

            // forward-slash & question-mark
            if (keyCode === 191 && !isShifted)
                chr = "/";
            else if (keyCode === 191 && isShifted)
                chr = "?";

            // grave-accent & squiglly
            if (keyCode === 192 && !isShifted)
                chr = "`";
            else if (keyCode === 192 && isShifted)
                chr = "~";

            // open-square-bracket & open-curly-brace
            if (keyCode === 219 && !isShifted)
                chr = "[";
            else if (keyCode === 219 && isShifted)
                chr = "{";

            // back-slash & bar
            if (keyCode === 220 && !isShifted)
                chr = "\\";
            else if (keyCode === 220 && isShifted)
                chr = "|";

            // close-square-bracket & close-curly-brace
            if (keyCode === 221 && !isShifted)
                chr = "]";
            else if (keyCode === 221 && isShifted)
                chr = "}";

            // single-quote & double-quote
            if (keyCode === 222 && !isShifted)
                chr = "'";
            else if (keyCode === 222 && isShifted)
                chr = "\"";


            //==========================================//
            // Handle command history
            //==========================================//
            // store commands when user presses the enter key
            if (keyCode === 13) {

                // Sometimes the buffer gets away with this so we'll sanitize our text
                _Console.buffer = _Console.buffer.replace("[object object]", "");

                if (_Console.buffer.trim()) {
                    _CommandHistory.push(_Console.buffer);
                    _CurrentCommandIndex = _CommandHistory.length - 1;
                }

                // no lines have advanced if a user has pressed enter
                _Console.linesAdvanced = 0;
            }

            // handle moving through command history with up and down
            var command = "";

            // up
            if (keyCode === 38) {

                // scroll to the bottom
                var consoleDiv = document.getElementById("divConsole");

                if (consoleDiv.scrollTop !== consoleDiv.scrollHeight)
                    consoleDiv.scrollTop = consoleDiv.scrollHeight;

                if (_CurrentCommandIndex > 0)
                    _CurrentCommandIndex -= 1;
                else
                    _CurrentCommandIndex = 0;

                command = _CommandHistory[_CurrentCommandIndex];

                var offset = _DrawingContext.measureText(_Console.currentFont, _Console.currentFontSize, ">");

                _Console.currentXPosition = offset;

                var xPos = _Console.currentXPosition;
                var yPos = (_Console.currentYPosition - _Console.currentFontSize) - 1;
                var width = 500;
                var height = _Console.currentFontSize + (_Console.currentFontSize / 2);

                // erase previous command
                _DrawingContext.clearRect(xPos, yPos, width, height);

                // display command on canvas
                if (command && _CommandHistory.length > 0) {
                    _Console.buffer = command;
                    _StdIn.putText(command);
                }
            }
            // down
            else if (keyCode === 40) {

                // scroll to the bottom
                var consoleDiv = document.getElementById("divConsole");

                if (consoleDiv.scrollTop !== consoleDiv.scrollHeight)
                    consoleDiv.scrollTop = consoleDiv.scrollHeight;

                if (_CurrentCommandIndex < _CommandHistory.length - 1)
                    _CurrentCommandIndex += 1;
                else
                    _CurrentCommandIndex = _CommandHistory.length - 1;

                command = _CommandHistory[_CurrentCommandIndex];

                var offset = _DrawingContext.measureText(_Console.currentFont, _Console.currentFontSize, ">");

                _Console.currentXPosition = offset;

                var xPos = _Console.currentXPosition;
                var yPos = (_Console.currentYPosition - _Console.currentFontSize) - 1;
                var width = 500;
                var height = _Console.currentFontSize + (_Console.currentFontSize / 2);

                // erase previous command
                _DrawingContext.clearRect(xPos, yPos, width, height);

                // display command on canvas
                if (command && _CommandHistory.length > 0) {
                    _Console.buffer = command;
                    _StdIn.putText(command);
                }

            }

            // handle backspace
            if (keyCode === 8 && _Console.buffer.length > 0) {

                _Console.clearBlinker();

                var charToDel = _Console.buffer.charAt(_Console.buffer.length - 1);

                // remove last character from the buffer
                _Console.buffer = _Console.buffer.slice(0, -1);


                var promptOffset = _DrawingContext.measureText(_Console.currentFont, _Console.currentFontSize, ">");

                // make sure we do not erase our prompter
                if (_Console.currentXPosition > promptOffset) {

                    var charWidth = _DrawingContext.measureText(_Console.currentFont, _Console.currentFontSize, charToDel);
                    _Console.currentXPosition -= charWidth;

                    var xPos = _Console.currentXPosition;
                    var yPos = (_Console.currentYPosition - _Console.currentFontSize) - 1;
                    var height = _Console.currentFontSize + (_Console.currentFontSize / 2);
                    _DrawingContext.clearRect(xPos, yPos, _Canvas.width, height);
                }

                // handle wrapped text
                if (_Console.currentXPosition <= promptOffset && _Console.linesAdvanced > 0)
                {
                    _Console.currentXPosition = _Console.lastXPosition;
                    _Console.currentYPosition = _Console.lastYPosition;

                    if (_Console.linesAdvanced > 0)
                        _Console.linesAdvanced -= 1;
                }
                /* else if (_Console.linesAdvanced === 0 && _Console.currentXPosition <= promptOffset)
                 return;*/
            } else if (keyCode !== 38 && keyCode !== 40)
                _KernelInputQueue.enqueue(chr);
        }
    }
});
/**
 *==============================================================================
 * filesystem.class.js
 * 
 * Currently the harddrive subclasses the filesystem class
 *    
 * @class FileSystem
 * @memberOf jambOS.OS
 * @inheritsFrom jambOS.OS.DeviceDriver
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.FileSystemDriver = new jambOS.util.createClass(jambOS.OS.DeviceDriver, {
    /**
     * @property {string} type
     */
    type: "filesystem",
    /**
     * @propert {array} usedFilenames - contains a list of created files
     */
    usedFilenames: [],
    /**
     * @property {localStorage} storage - This is our storage unit
     */
    storage: null,
    /**
     * Interrupt service routine that will handle all our read, write, delete,
     * create, list, and format filesystem calls
     * @public
     * @method isr
     * @param {int} routine
     * @param {object} data
     */
    isr: function(routine, data) {
        var filename = data["filename"];
        var fileData = data["fileData"];

        switch (routine) {
            case FSDD_CREATE:
                if (this.createFile(filename))
                    _StdIn.putText("File created: " + filename);
                else
                    _StdIn.putText("Sorry: Cannot create duplicate files!");
                break;
            case FSDD_READ:
                this.readFile(filename);
                break;
            case FSDD_WRITE:
                if (this.writeFile(filename, fileData))
                    _StdIn.putText("Written data to: " + filename);
                else
                    _StdIn.putText("Sorry: File \"" + filename + "\" not found!");
                break;
            case FSDD_DELETE:
                if (this.deleteFile(filename))
                    _StdIn.putText("Deleted: \"" + filename + "\"");
                else
                    _StdIn.putText("Sorry: File \"" + filename + "\" not found!");
                break;
            case FSDD_FORMAT:
                _HardDrive.formatDrive();
                break;
            case FSDD_LIST_FILES:
                this.listFiles();
                break;
        }

    },
    /**
     * Reads data from harddrive
     * @public
     * @method
     * @param {string} address - Adress location to read from
     * @returns {string} data
     */
    read: function(address) {
        return this.storage.getItem(address);
    },
    /**
     * Writes to the harddrive
     * @public
     * @method write
     * @param {string} address - Address location to write to
     * @param {string} data - Data to write to specified data address
     */
    write: function(address, data) {
        this.storage.setItem(address, data);
    },
    /**
     * Creates file in our harddrive
     * @public
     * @method createFile
     * @param {strign} filename 
     */
    createFile: function(filename) {
        var self = this;
        var availableTSB = _HardDrive.findNextAvailableTSB();
        var isDuplicate = this._isDuplicate(filename);

        // TODO: check for special characters, we might not want to create files with speical characters

        if (availableTSB && !isDuplicate) {
            _HardDrive.initializeTSB(availableTSB, filename);
            self.updateHardDriveDisplay();
            return true;
        }

        return false;
    },
    /**
     * Reads contents from a file
     * @public
     * @method readFile
     * @param {string} filename 
     * @param {boolean} canPrint
     */
    readFile: function(filename, canPrint) {

        canPrint = typeof canPrint === "boolean" ? canPrint : true;

        var output = "";

        // get filename and its address from our array list of used filenames
        var file = $.grep(this.usedFilenames, function(el) {
            return el.filename.toLowerCase() === filename.toLowerCase();
        })[0];

        if (file) {
            // get metadata content that holds tsb address to where content is stored
            var value = JSON.parse(this.read(file.address));
            var track = parseInt(value[TRACK_BIT]);
            var sector = parseInt(value[SECTOR_BIT]);
            var block = parseInt(value[BLOCK_BIT]);

            // use previous info to get content from where its stored in storage
            var dataAddress = this._getAddress({track: track, sector: sector, block: block});
            var data = JSON.parse(this.read(dataAddress));
            track = parseInt(data[TRACK_BIT]);
            sector = parseInt(data[SECTOR_BIT]);
            block = parseInt(data[BLOCK_BIT]);
            var content = data[CONTENT_BIT];

            output = content.replace("-", "");

            // output data to screen
            if (canPrint)
                _StdIn.putText(content);

            // handle text that wrapped around
            while (track !== -1) {
                dataAddress = this._getAddress({track: track, sector: sector, block: block});
                data = JSON.parse(this.read(dataAddress));
                track = parseInt(data[TRACK_BIT]);
                sector = parseInt(data[SECTOR_BIT]);
                block = parseInt(data[BLOCK_BIT]);
                content = data[CONTENT_BIT];

                output += content.replace(/-/gi, "");

                if (canPrint)
                    _StdIn.putText(content);
            }
        } else if (canPrint)
            _StdIn.putText("Sorry: File \"" + filename + "\" not found!");

        return output;

    },
    /**
     * Writes data to file
     * @public
     * @method writeFile
     * @param {string} filename
     * @param {string} fileData
     */
    writeFile: function(filename, fileData) {
        var self = this;
        // get filename and its address from our array list of used filenames
        var file = $.grep(this.usedFilenames, function(el) {
            return el.filename.toLowerCase() === filename.toLowerCase();
        })[0];

        if (file) {
            // get metadata content that holds tsb address to where content is stored
            var value = JSON.parse(this.read(file.address));
            var track = parseInt(value[TRACK_BIT]);
            var sector = parseInt(value[SECTOR_BIT]);
            var block = parseInt(value[BLOCK_BIT]);

            var metaDataTSB = this._parseAddress(file.address);
            var metaDataAddress = {track: metaDataTSB.track, sector: metaDataTSB.sector, block: metaDataTSB.block};

            // use previous info to get content from where its stored in storage
            var dataAddress = this._getAddress(metaDataAddress);
            var data = JSON.parse(this.read(dataAddress));
            track = parseInt(data[TRACK_BIT]);
            sector = parseInt(data[SECTOR_BIT]);
            block = parseInt(data[BLOCK_BIT]);

            block -= 1;

            // split our data into chunks of 60bit content
            var content = fileData.match(/.{1,60}/g);
            var occupiedBit = 1;
            var i = 0;
            $.each(content, function() {
                i++;
                if (block < ALLOCATABLE_BLOCKS)
                    block += 1;
                else {
                    block = 0;
                    if (sector < ALLOCATABLE_SECTORS)
                        sector += 1;
                    else {
                        sector = 0;
                        if (track < ALLOCATABLE_TRACKS && track > 0) {
                            track += 1;
                        }
                    }
                }
                dataAddress = self._getAddress({track: track, sector: sector, block: block});

                // handle last tsb occupied by program
                if (i === content.length)
                {

                    track = -1;
                    sector = -1;
                    block = -2;
                }

                // file data
                var value = "[" + occupiedBit + "," + track + "," + sector + "," + (block + 1) + ",\"" + self.sanitizeFileSystemValue(this) + "\"]";
                self.write(dataAddress, value);

            });

            self.updateHardDriveDisplay();

            return true;

        }

        return false;
    },
    /**
     * Deletes file from file system
     * @public
     * @method deleteFile
     * @param {string} filename
     * @returns {boolean}
     */
    deleteFile: function(filename) {
        var self = this;

        // get filename and its address from our array list of used filenames
        var file = $.grep(this.usedFilenames, function(el) {
            return el.filename.toLowerCase() === filename.toLowerCase();
        })[0];

        if (file) {
            // get metadata content that holds tsb address to where content is stored
            var value = JSON.parse(this.read(file.address));
            var track = parseInt(value[TRACK_BIT]);
            var sector = parseInt(value[SECTOR_BIT]);
            var block = parseInt(value[BLOCK_BIT]);
            var occupiedBit = 0;
            var fileAddress = file.address;

            // file metadata
            var value = "[" + occupiedBit + ",-1,-1,-1,\"" + this.sanitizeFileSystemValue("") + "\"]";
            this.write(fileAddress, value);

            // use previous info to get content from where its stored in storage
            var dataAddress = this._getAddress({track: track, sector: sector, block: block});
            var data = JSON.parse(this.read(dataAddress));
            track = parseInt(data[TRACK_BIT]);
            sector = parseInt(data[SECTOR_BIT]);
            block = parseInt(data[BLOCK_BIT]);
            occupiedBit = parseInt(data[OCCUPIED_BIT]);
            var linkedFiles = this.getLinkedFileBlocks(dataAddress);

            $.each(linkedFiles, function() {
                var value = "[0,-1,-1,-1,\"" + self.sanitizeFileSystemValue("") + "\"]";
                self.write(this, value);
            });

            // make sure we remove our file from our used files array
            var tempList = [];
            $.each(this.usedFilenames, function() {
                if (this.filename.toLowerCase() !== filename.toLowerCase())
                    tempList.push(this);
            });
            this.usedFilenames = tempList;

            self.updateHardDriveDisplay();

            return true;
        }

        return false;
    },
    getLinkedFileBlocks: function(parent) {
        var files = [parent];
        var currentKey = parent;
        while (currentKey !== "[-1,-1,-1]") {
            var parentVals = JSON.parse(this.read(currentKey));
            var track = parseInt(parentVals[TRACK_BIT]);
            var sector = parseInt(parentVals[SECTOR_BIT]);
            var block = parseInt(parentVals[BLOCK_BIT]);
            var child = this._getAddress({track: track, sector: sector, block: block});

            if (child !== "[-1,-1,-1]")
                files.push(child);
            currentKey = child;
        }

        return files;
    },
    /**
     * Lists out all the files in the file system
     * @public
     * @method listFiles
     */
    listFiles: function() {

        if (this.usedFilenames.length === 0)
            _StdIn.putText("File System is currently empty!");

        // Display all files in the file system
        $.each(this.usedFilenames, function() {
            _StdIn.putText(this.filename);
            _StdIn.advanceLine();
        });


    },
    /**
     * Sanitizes file system value
     * @public
     * @method sanitizeFileSystemValue
     * @param {string} value 
     * @returns {string} value
     */
    sanitizeFileSystemValue: function(value) {

        var sizeOfData = value.length;

        // Sanitize our value by adding dashes at empty spaces
        for (var i = sizeOfData; i < MAX_FILESIZE; i++)
            value += "-";

        return value;
    },
    updateHardDriveDisplay: function() {
        $("#harddrive .content").empty();
        for (var address in this.storage) {
            $("#harddrive .content").append(this.read(address) + "<br/>");
        }
    },
    /**
     * Checks if filename is a duplicate
     * @private
     * @method _isDuplicate
     * @param {string} filename 
     * @returns {boolean}
     */
    _isDuplicate: function(filename) {
        var duplicates = $.grep(this.usedFilenames, function(el) {
            return el.filename.toLowerCase() === filename.toLowerCase();
        });
        return duplicates.length > 0;
    },
    /**
     * Parses storage address
     * @private
     * @method _parseAddress
     * @param {string} address
     * @returns {object} tsb
     */
    _parseAddress: function(address) {
        var sanitizedAddress = address.replace(/\[|,|\]/g, "");
        var track = sanitizedAddress.charAt(0);
        var sector = sanitizedAddress.charAt(1);
        var block = sanitizedAddress.charAt(2);

        var tsb = {track: parseInt(track), sector: parseInt(sector), block: parseInt(block)};

        return tsb;
    },
    /**
     * Get's address in storaget given a tsb
     * @private
     * @method _getAddress
     * @param {object} tsb
     * @returns {string} address
     */
    _getAddress: function(tsb) {
        return "[" + tsb.track + "," + tsb.sector + "," + tsb.block + "]";
    }
});
/**
 * =============================================================================
 * queue.class.js 
 * 
 * A simple Queue, which is really just a dressed-up JavaScript Array.
 * See the Javascript Array documentation at http://www.w3schools.com/jsref/jsref_obj_array.asp .
 * Look at the push and shift methods, as they are the least obvious here.
 * 
 * @public
 * @class Queue
 * @memberOf jambOS.OS
 * =============================================================================
 */

jambOS.OS.Queue = jambOS.util.createClass({
    /**
     * @property {string} type          - Type
     */
    type: "readyqueue",
    /**
     * @property {Array} q              - Our Queue
     */
    q: new Array(),
    /**
     * Gets the size of our queue
     * @public
     * @method getSize
     * @return {int}                    - Size of our queue
     */
    getSize: function() {
        return this.q.length;
    },
    /**
     * Checks if our queue is empty or not
     * @public
     * @method isEmpty
     * @returns {boolean}   true|false
     */
    isEmpty: function() {
        return (this.q.length === 0);
    },
    /**
     * Adds element to queue
     * @public
     * @method enqueue
     * @param {anyType} element   
     */
    enqueue: function(element) {
        this.q.push(element);
    },
    /**
     * Removes first element from queue
     * @public
     * @method dequeue
     * @returns {anyType} retVal
     */
    dequeue: function() {
        var retVal = null;
        if (!this.isEmpty())
        {
            retVal = this.q.shift();
        }
        return retVal;
    },
    /**
     * String representation of our queue
     * @public
     * @returns {string} retVal
     */
    toString: function() {
        var retVal = "";
        for (var i in this.q)
        {
            retVal += "[" + this.q[i] + "] ";
        }
        return retVal;
    }
});
/**
 * =============================================================================
 * processqueue.class.js 
 * 
 * Our implementation of the process queue based on the Queue Class
 * 
 * @public
 * @class ProcessQueue
 * @inheritsFrom jambOS.OS.Queue
 * @memberOf jambOS.OS
 * =============================================================================
 */

jambOS.OS.ProcessQueue = jambOS.util.createClass(jambOS.OS.Queue, /** @scope jambOS.OS.ReadyQueue.prototype */ {
    /**
     * @property {string} type          - Type
     */
    type: "processqueue",
    /**
     * @property {Array} q              - Our Queue
     */
    q: [],
    /**
     * Constructor
     * @public
     * @param {object} options constructor arguments we wish to pass
     */
    initialize: function(options) {
        options || (options = {});
        this.setOptions(options);
    },
    getLastProcess: function() {
        return this.q[this.q.length - 1];
    },
    /**
     * Will have to work on this in the future but in the meantime we'll just return
     * a string containing the process queue's pids
     * @returns {string} type
     */
    toString: function() {

        var processQueue = "";

        for (var key in this.q)
            processQueue += "{" + this.q[key].pid + "}";

        return processQueue;
    }
});
/**
 *==============================================================================
 * Class SystemServices
 *    
 * @class SystemServices
 * @memberOf jambOS.OS
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.SystemServices = jambOS.util.createClass(/** @scope jambOS.OS.SystemServices.prototype */{
    /**
     * @property {string} type
     */
    type: "systemservices",
    /**
     * Adds prompt string to console display
     */
    putPrompt: function()
    {
        _StdIn.putText(this.promptStr);
    },
    /**
     * Handles commands and entered text
     * @param {string} buffer
     */
    handleInput: function(buffer)
    {
        _Kernel.trace("Shell Command~" + buffer);
        // 
        // Parse the input...
        //
        var userCommand = this.parseInput(buffer);
        
        // ... and assign the command and args to local variables.
        var cmd = userCommand.command;
        var args = userCommand.args;
        
        //
        // Determine the command and execute it.
        //
        // JavaScript may not support associative arrays in all browsers so we have to
        // iterate over the command list in attempt to find a match.  TODO: Is there a better way? Probably.
        var index = 0;
        var found = false;
        while (!found && index < this.commandList.length)
        {
            if (this.commandList[index].command === cmd)
            {
                found = true;
                var fn = this.commandList[index].behavior;
            }
            else
            {
                ++index;
            }
        }
        if (found)
        {
            this.execute(fn, args);
        }
        else
        {
            // It's not found, so check for curses and apologies before declaring the command invalid.
            if (this.curses.indexOf("[" + jambOS.util.rot13(cmd) + "]") >= 0)      // Check for curses.
            {
                this.execute(shellCurse);
            }
            else if (this.apologies.indexOf("[" + cmd + "]") >= 0)      // Check for apologies.
            {
                this.execute(shellApology);
            }
            else    // It's just a bad command.
            {
                this.execute(shellInvalidCommand);
            }
        }
    },
    /**
     * Sanitizes buffer input
     * @param {string} buffer 
     * @returns {jambOS.OS.UserCommand} retVal
     */
    parseInput: function(buffer)
    {
        var retVal = new jambOS.OS.UserCommand();

        // 1. Remove leading and trailing spaces.
        buffer = jambOS.util.trim(buffer);

        // 2. Lower-case it.
        buffer = buffer.toLowerCase();

        // 3. Separate on spaces so we can determine the command and command-line args, if any.
        var tempList = buffer.split(" ");

        // 4. Take the first (zeroth) element and use that as the command.
        var cmd = tempList.shift();  // Yes, you can do that to an array in JavaScript.  See the Queue class.
        // 4.1 Remove any left-over spaces.
        cmd = jambOS.util.trim(cmd);
        // 4.2 Record it in the return value.
        retVal.command = cmd;
        retVal.args = [];

        // 5. Now create the args array from what's left.
        for (var i in tempList)
        {
            var arg = jambOS.util.trim(tempList[i]);
            if (arg !== "")
            {
                retVal.args.push(tempList[i]);
            }
        }
        return retVal;
    },
    /**
     * Executes functions. This is useful to us when executing a
     * user command
     * @param {function} fn
     * @param {array} args
     */
    execute: function(fn, args)
    {
        // We just got a command, so advance the line...
        _StdIn.advanceLine();
        // ... call the command function passing in the args...
        fn(args);
        // Check to see if we need to advance the line again
        if (_StdIn.currentXPosition > 0)
        {
            _StdIn.advanceLine();
        }
        // ... and finally write the prompt again.
        this.putPrompt();
    }
});



//
// Shell Command Functions.  Again, not part of Shell() class per se', just called from there.
//
function shellInvalidCommand()
{
    _StdIn.putText("Invalid Command. ");
    if (_SarcasticMode)
    {
        _StdIn.putText("Duh. Go back to your Speak & Spell.");
    }
    else
    {
        _StdIn.putText("Type 'help' for, well... help.");
    }
}

function shellCurse()
{
    _StdIn.putText("Oh, so that's how it's going to be, eh? Fine.");
    _StdIn.advanceLine();
    _StdIn.putText("Bitch.");
    _SarcasticMode = true;
}

function shellApology()
{
    if (_SarcasticMode) {
        _StdIn.putText("Okay. I forgive you. This time.");
        _SarcasticMode = false;
    } else {
        _StdIn.putText("For what?");
    }
}

/**
 *==============================================================================
 * Class ShellCommand
 *    
 * @class ShellCommand
 * @memberOf jambOS.OS
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.ShellCommand = jambOS.util.createClass(/** @scope jambOS.OS.ShellCommand.prototype */{
    type: "shellcommand",
    command: null,
    description: null,
    behavior: null,
    /**
     * Constructor
     * @param {object} options              - values to initialize the class with
     */
    initialize: function(options) {
        this.command = options.command;
        this.description = options.description;
        this.behavior = options.behavior;
        return this;
    },
    /**
     * Executes shell command
     * @returns {function} behavior
     */
    execute: function() {
        return this.behavior();
    }
});
jambOS.OS.UserCommand = jambOS.util.createClass(
{
    // Properties
    command: "",
    args: []
});
/**
 *==============================================================================
 * shell.class.js
 *    
 * @class Shell
 * @memberOf jambOS.OS
 * @inheritsFrom jambOS.OS.SystemServices
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.Shell = jambOS.util.createClass(jambOS.OS.SystemServices, /** @scope jambOS.OS.Shell.prototype */ {
    /**
     * @property {string} promptStr
     */
    promptStr: ">",
    /**
     * @property {array} commandList
     */
    commandList: [],
    /**
     * @property {string} curses 
     */
    curses: "[fuvg],[cvff],[shpx],[phag],[pbpxfhpxre],[zbgureshpxre],[gvgf]",
    /**
     * @property {string} appologies
     */
    apologies: "[sorry]",
    /**
     * Constructor
     */
    initialize: function() {
        var sc = null;
        //
        // Load the command list.

        // date
        sc = new jambOS.OS.ShellCommand({
            command: "date",
            description: "- Displays the current date and time",
            behavior: function()
            {
                var date = new Date();
                _StdIn.putText(date.toString());
            }});
        this.commandList.push(sc);

        // whereami
        sc = new jambOS.OS.ShellCommand({
            command: "whereami",
            description: "- Displays the current location",
            behavior: function() {

                var output = window.location.href;

                _StdIn.putText(output);
            }});
        this.commandList.push(sc);

        // whoisawesome
        sc = new jambOS.OS.ShellCommand({
            command: "whoisawesome",
            description: "- Displays emotiocon of person",
            behavior: function() {
                _StdIn.putText("YOU ARE!!!!! d(*_*)b");
            }});
        this.commandList.push(sc);

        // status
        sc = new jambOS.OS.ShellCommand({
            command: "status",
            description: "<string> - Sets status message on taskbar",
            behavior: function(args) {
                _TaskbarContext.font = "bold 12px Arial";
                if (args.length > 0) {
                    _TaskbarContext.clearRect(165, 0, 400, 20);
                    _TaskbarContext.fillText("Status: " + args.join(" "), 200, 16);
                } else {
                    _TaskbarContext.clearRect(165, 0, 400, 20);
                    _TaskbarContext.fillText("Status: OS is running...", 200, 16);
                    _StdIn.putText("Usage: status <String> - Sets status message on taskbar");
                }
            }});
        this.commandList.push(sc);

        // load
        sc = new jambOS.OS.ShellCommand({
            command: "load",
            description: "- loads commands from the user input text area",
            behavior: function(args) {
                var priority = parseInt(args[0]);
                var textInput = $("#taProgramInput").val();
                var isValid = /^[0-9a-f]{2}( [0-9a-f]{2})*$/i.test(textInput);
                var process = isValid ? _Kernel.processManager.load(textInput.split(/\s/), priority) : null;
                if (!textInput.trim())
                    _StdIn.putText("Please enter an input value then call the load command");
                else if (!isValid)
                    _StdIn.putText("Invalid program");
            }});
        this.commandList.push(sc);

        // psod
        sc = new jambOS.OS.ShellCommand({
            command: "psod",
            description: "- simulates an OS error",
            behavior: function() {
                _TaskbarCanvas.style.backgroundColor = "pink";
                $("#divConsole, #taLog, #taProgramInput, #memory .content, #cpuStatus .content").css({background: "pink"});
                return _Kernel.trapError("Pink screen of death!", true);
            }});
        this.commandList.push(sc);

        // ver
        sc = new jambOS.OS.ShellCommand({
            command: "ver",
            description: "- Displays the current version data.",
            behavior: function(args)
            {
                _StdIn.putText(jambOS.name + " version " + jambOS.version);
            }});
        this.commandList.push(sc);

        // help
        sc = new jambOS.OS.ShellCommand({
            command: "help",
            description: "- This is the help command. Seek help.",
            behavior: function(args)
            {
                _StdIn.putText("Commands:");
                for (var i in _OsShell.commandList)
                {
                    _StdIn.advanceLine();
                    _StdIn.putText("  " + _OsShell.commandList[i].command + " " + _OsShell.commandList[i].description);
                }
                _StdIn.advanceLine();
            }});
        this.commandList.push(sc);

        // shutdown
        sc = new jambOS.OS.ShellCommand({
            command: "shutdown",
            description: "- Shuts down the virtual OS but leaves the underlying hardware simulation running.",
            behavior: function(args) {
                _StdIn.putText("Shutting down...");
                // Call Kernel shutdown routine.
                _Kernel.shutdown();
                // TODO: Stop the final prompt from being displayed.  If possible.  Not a high priority.  (Damn OCD!)
            }});
        this.commandList.push(sc);

        // clear
        sc = new jambOS.OS.ShellCommand({
            command: "clear",
            description: "- Clears the screen and resets the cursor position.",
            behavior: function(args)
            {
                _StdIn.clearScreen();
                _StdIn.resetXY();
            }});
        this.commandList.push(sc);

        // man <topic>
        sc = new jambOS.OS.ShellCommand({
            command: "man",
            description: "<topic> - Displays the MANual page for <topic>.",
            behavior: function(args)
            {
                if (args.length > 0)
                {
                    var topic = args[0];
                    switch (topic)
                    {
                        case "help":
                            _StdIn.putText("Help displays a list of (hopefully) valid commands.");
                            break;
                        default:
                            _StdIn.putText("No manual entry for " + args[0] + ".");
                    }
                }
                else
                {
                    _StdIn.putText("Usage: man <topic>  Please supply a topic.");
                }
            }});
        this.commandList.push(sc);

        // trace <on | off>
        sc = new jambOS.OS.ShellCommand({
            command: "trace",
            description: "<on | off> - Turns the OS trace on or off.",
            behavior: function(args)
            {
                if (args.length > 0)
                {
                    var setting = args[0];
                    switch (setting)
                    {
                        case "on":
                            if (_Trace && _SarcasticMode)
                            {
                                _StdIn.putText("Trace is already on, dumbass.");
                            }
                            else
                            {
                                _Trace = true;
                                _StdIn.putText("Trace ON");
                            }

                            break;
                        case "off":
                            _Trace = false;
                            _StdIn.putText("Trace OFF");
                            break;
                        default:
                            _StdIn.putText("Invalid arguement.  Usage: trace <on | off>.");
                    }
                }
                else
                {
                    _StdIn.putText("Usage: trace <on | off>");
                }
            }});
        this.commandList.push(sc);

        // rot13 <string>
        sc = new jambOS.OS.ShellCommand({
            command: "rot13",
            description: "<string> - Does rot13 obfuscation on <string>.",
            behavior: function(args)
            {
                if (args.length > 0)
                {
                    _StdIn.putText(args[0] + " = '" + jambOS.util.rot13(args[0]) + "'");     // Requires Utils.js for jambOS.util.rot13() function.
                }
                else
                {
                    _StdIn.putText("Usage: rot13 <string>  Please supply a string.");
                }
            }});
        this.commandList.push(sc);

        // prompt <string>
        sc = new jambOS.OS.ShellCommand({
            command: "prompt",
            description: "<string> - Sets the prompt.",
            behavior: function(args)
            {
                if (args.length > 0)
                {
                    _OsShell.promptStr = args[0];
                }
                else
                {
                    _StdIn.putText("Usage: prompt <string>  Please supply a string.");
                }
            }});
        this.commandList.push(sc);

        // processes - list the running processes and their IDs
        // kill <id> - kills the specified process id.
        sc = new jambOS.OS.ShellCommand({
            command: "kill",
            description: "<id> - kills the specified process id",
            behavior: function(args) {
                var pid = parseInt(args[0]);

                if (!isNaN(pid)) {
                    var pcb = $.grep(_CPU.scheduler.residentList, function(el) {
                        return el.pid === pid;
                    })[0];

                    if (pcb) {
                        pcb.set("state", "terminated");
                        _Kernel.processManager.unload(pcb);
                        _StdIn.putText("Deleted process: " + pcb.pid)
                    } else
                        _StdIn.putText("Invalid process!");
                } else
                    _StdIn.putText("Usage: kill <int>");
            }});
        this.commandList.push(sc);



        // run <id>
        sc = new jambOS.OS.ShellCommand({
            command: "run",
            description: "<id> - Runs program already in memory",
            behavior: function(args) {
                var pid = args[0];
                pid = parseInt(pid);

                var pcb = $.grep(_CPU.scheduler.residentList, function(el) {
                    return el.pid === pid;
                })[0];

                if (args[0] && pcb && !_Stepover) {
                    _Kernel.memoryManager.set("activeSlot", pcb.slot);
                    _Kernel.processManager.execute(pcb);
                } else if (args[0] && pcb && _Stepover) {
                    _StdIn.putText("stepover is ON. Use the stepover button to run program.");
                } else if (args[0] && !pcb)
                    _StdIn.putText("Invalid Process ID");
                else
                    _StdIn.putText("Usage: run <id | all> - Runs program already in memory");
            }});
        this.commandList.push(sc);

        // runall
        sc = new jambOS.OS.ShellCommand({
            command: "runall",
            description: "- Runs all programs loaded in memory",
            behavior: function() {

                // Check whether we have processes that are loaded in memory
                // Also check whether we want to stepover our process which in 
                // this case we do not.
                if (_CPU.scheduler.residentList.length > 0 && !_Stepover) {

                    // initialize new ready queue
                    _CPU.scheduler.readyQueue = new jambOS.OS.ProcessQueue();

                    // Loop through our residentList and add them to the readyQueue
                    $.each(_CPU.scheduler.residentList, function() {
                        _CPU.scheduler.readyQueue.enqueue(this);
                    });

                    // Get first process from the readyQueue
                    var process = _CPU.scheduler.readyQueue.dequeue();

                    // update process table with pcb data from the ready queue
                    _Kernel.processManager.updatePCBStatusDisplay();


                    // Set our active slot in which to base our operations from
                    _Kernel.memoryManager.set("activeSlot", process.slot);

                    // Execute our process
                    _Kernel.processManager.execute(process);

                } else if (_CPU.scheduler.residentList.length > 0 && _StepOver)
                    _StdIn.putText("Please turn off the StepOver command to run all processes");
                else
                    _StdIn.putText("There are no processes to run!");

            }});
        this.commandList.push(sc);

        // stepover <on | off>
        sc = new jambOS.OS.ShellCommand({
            command: "stepover",
            description: "<on | off> - Turns the OS stepover on or off.",
            behavior: function(args)
            {
                if (args.length > 0)
                {
                    var setting = args[0];
                    switch (setting)
                    {
                        case "on":
                            if (_Stepover && _SarcasticMode)
                            {
                                _StdIn.putText("Stepover is already on, dumbass.");
                            }
                            else
                            {
                                _Stepover = true;
                                _StdIn.putText("Stepover ON");
                            }

                            break;
                        case "off":
                            _Stepover = false;
                            _StdIn.putText("Stepover OFF");
                            break;
                        default:
                            _StdIn.putText("Invalid arguement.  Usage: stepover <on | off>.");
                    }
                }
                else
                {
                    _StdIn.putText("Usage: stepover <on | off>");
                }
            }});
        this.commandList.push(sc);

        // quantum <int>
        sc = new jambOS.OS.ShellCommand({
            command: "quantum",
            description: "<int> - Changes the scheduling quantum",
            behavior: function(args) {
                var quantum = parseInt(args[0]);
                if (args.length > 0 && !isNaN(quantum)) {
                    _CPU.scheduler.set("quantum", quantum);
                    _StdIn.putText("Scheduling quantum set to: " + quantum);
                } else {
                    _StdIn.putText("Usage: quantum <int>");
                }
            }
        });
        this.commandList.push(sc);

        // residentList        
        sc = new jambOS.OS.ShellCommand({
            command: "residentlist",
            description: "- Displays the pids of all active processes",
            behavior: function() {
                var residentList = _CPU.scheduler.residentList;

                if (residentList.length) {
                    var processIDs = "";
                    $.each(residentList, function() {
                        processIDs += "[" + this.pid + "]";
                    });
                    _StdIn.putText(processIDs);
                } else {
                    _StdIn.putText("No active processes available!");
                }
            }
        });
        this.commandList.push(sc);

        // create <filename>
        sc = new jambOS.OS.ShellCommand({
            command: "create",
            description: "<filename> - creates file in memory",
            behavior: function(args) {
                var filename = args[0];
                if (filename) {
                    var arguments = {
                        filename: filename,
                        fileData: null
                    };
                    _Kernel.interruptHandler(FSDD_CALL_IRQ, [FSDD_CREATE, arguments]);
                } else
                    _StdIn.putText("Usage: create <filename>");
            }
        });
        this.commandList.push(sc);

        // read <filename>
        sc = new jambOS.OS.ShellCommand({
            command: "read",
            description: "<filename> - reads file in memory",
            behavior: function(args) {
                var filename = args[0];
                if (filename) {
                    var arguments = {
                        filename: filename,
                        fileData: null
                    };
                    _Kernel.interruptHandler(FSDD_CALL_IRQ, [FSDD_READ, arguments]);
                } else
                    _StdIn.putText("Usag: read <filename>");
            }
        });
        this.commandList.push(sc);

        // write <filename> "data"
        sc = new jambOS.OS.ShellCommand({
            command: "write",
            description: "<filename>  'data' - writes data to file in memory",
            behavior: function(args) {
                var filename = args.shift();
                var data = args.join(" ");
                var firstChar = data[0];
                var lastChar = data[data.length - 1];

                // make sure that our input is in the right format
                if (data.length > 0 && filename && (firstChar === "\"" || firstChar === "'") && (lastChar === "\"" || lastChar === "'")) {
                    // remove first quote char
                    data = data.substr(1);

                    // remove last quote char
                    data = data.substr(0, data.length - 1);
                    var arguments = {
                        filename: filename,
                        fileData: data
                    };

                    _Kernel.interruptHandler(FSDD_CALL_IRQ, [FSDD_WRITE, arguments]);
                } else
                    _StdIn.putText("Usage: write <filename> \"data\"");
            }
        });
        this.commandList.push(sc);

        // delete <filename>
        sc = new jambOS.OS.ShellCommand({
            command: "delete",
            description: "<filename> - deletes file from memory",
            behavior: function(args) {
                var filename = args[0];
                if (filename) {
                    var arguments = {
                        filename: filename,
                        fileData: null
                    };
                    _Kernel.interruptHandler(FSDD_CALL_IRQ, [FSDD_DELETE, arguments]);
                } else
                    _StdIn.putText("Usage: delete <filename>");
            }
        });
        this.commandList.push(sc);

        // format
        sc = new jambOS.OS.ShellCommand({
            command: "format",
            description: "- Initializes all blocks in all sectors",
            behavior: function() {
                var arguments = {
                    filename: null,
                    fileData: null
                };
                _Kernel.interruptHandler(FSDD_CALL_IRQ, [FSDD_FORMAT, arguments]);
                _StdIn.putText("HD format complete!");
            }
        });
        this.commandList.push(sc);


        // ls
        sc = new jambOS.OS.ShellCommand({
            command: "ls",
            description: "- Lists all files currently stored on the disk",
            behavior: function() {
                var arguments = {
                    filename: null,
                    fileData: null
                };
                _Kernel.interruptHandler(FSDD_CALL_IRQ, [FSDD_LIST_FILES, arguments]);
            }
        });
        this.commandList.push(sc);


        // setschedule [rr, fcfs, priority]
        sc = new jambOS.OS.ShellCommand({
            command: "setschedule",
            description: "[rr, fcfs, priority] - Sets scheduling algorithm",
            behavior: function(args) {
                var algorithm = args[0];
                switch (algorithm) {
                    case "rr":
                        _CPU.scheduler.set("currentSchedulingAlgorithm", RR_SCHEDULER);
                        _StdIn.putText("Scheduling Algorithm: Round Robin");

                        break;
                    case "fcfs":
                        _CPU.scheduler.set("currentSchedulingAlgorithm", FCFS_SCHEDULER);
                        _StdIn.putText("Scheduling Algorithm: First Come First Served");
                        break;
                    case "priority":
                        _CPU.scheduler.set("currentSchedulingAlgorithm", PRIORITY_SCHEDULER);
                        _StdIn.putText("Scheduling Algorithm: Priority");
                        break;
                    default:
                        _StdIn.putText("Usage: setschedule [rr, fcfs, priority]");
                        break;
                }
            }
        });
        this.commandList.push(sc);

        // get scheduling algorithm        
        sc = new jambOS.OS.ShellCommand({
            command: "getschedule",
            description: "- returns currently selected cpu scheduling algorithm",
            behavior: function() {
                var algorithm = _CPU.scheduler.get("currentSchedulingAlgorithm");
                switch (algorithm) {
                    case RR_SCHEDULER:
                        _StdIn.putText("Scheduling Algorithm: Round Robin");
                        break;
                    case FCFS_SCHEDULER:
                        _StdIn.putText("Scheduling Algorithm: First Come First Served");
                        break;
                    case PRIORITY_SCHEDULER:
                        _StdIn.putText("Scheduling Algorithm: Priority");
                        break;
                }
            }
        });
        this.commandList.push(sc);


        //
        // Display the initial prompt.
        this.putPrompt();
    }
});

/**
 * =============================================================================
 * kernel.js  
 * 
 * Routines for the Operating System, NOT the host. 
 * 
 * This code references page numbers in the text book: 
 * Operating System Concepts 8th edition by Silberschatz, Galvin, and Gagne.  
 * ISBN 978-0-470-12872-5
 * 
 * @public
 * @requires global.js
 * @class DeviceDriver
 * @memberOf jambOS.OS
 * =============================================================================
 */

jambOS.OS.Kernel = jambOS.util.createClass({
    /**
     * @property {jambOS.OS.DeviceDriverKeyboard} keyboardDriver
     */
    keyboardDriver: null,
    /**
     * @property {jambOS.OS.MemoryManager} memoryManager
     */
    memoryManager: null,
    /**
     * @property {jambOS.OS.ProcessManager} processManager
     */
    processManager: null,
    /**
     * Constructor
     */
    initialize: function() {

        // support Previous calls from outside
        krnInterruptHandler = this.interruptHandler;

        this.memoryManager = new jambOS.OS.MemoryManager();
        this.processManager = new jambOS.OS.ProcessManager();
    },
    /**
     * Contains OS Startup and shutdown routines
     * @public
     * @returns {undefined}
     */
    bootstrap: function()      // Page 8.
    {
        _Control.hostLog("bootstrap", "host");  // Use hostLog because we ALWAYS want this, even if _Trace is off.

        // Initialize our global queues.
        _KernelInterruptQueue = new jambOS.OS.Queue();  // A (currently) non-priority queue for interrupt requests (IRQs).
        _KernelBuffers = new Array();         // Buffers... for the kernel.
        _KernelInputQueue = new jambOS.OS.Queue();      // Where device input lands before being processed out somewhere.

        // The command line interface / console I/O device.
        _Console = new jambOS.OS.Console();

        // Initialize standard input and output to the _Console.
        _StdIn = _Console;
        _StdOut = _Console;

        // Load the Keyboard Device Driver
        this.trace("Loading the keyboard device driver.");
        this.keyboardDriver = new jambOS.OS.DeviceDriverKeyboard();     // Construct it.  TODO: Should that have a _global-style name?
        this.keyboardDriver.driverEntry();                    // Call the driverEntry() initialization routine.
        this.trace(this.keyboardDriver.status);

        //
        // ... more?
        //

        // Enable the OS Interrupts.  (Not the CPU clock interrupt, as that is done in the hardware sim.)
        this.trace("Enabling the interrupts.");
        this.enableInterupts();

        // Launch the shell.
        this.trace("Creating and Launching the shell.");
        _OsShell = new jambOS.OS.Shell();

        // Finally, initiate testing.
        if (_GLaDOS) {
            _GLaDOS.afterStartup();
        }
    },
    /**
     * Shuts down OS
     * @public
     * @method shutdown
     */
    shutdown: function()
    {
        this.trace("begin shutdown OS");
        // TODO: Check for running processes.  Alert if there are some, alert and stop.  Else...    
        // ... Disable the Interrupts.
        this.trace("Disabling the interrupts.");
        this.disableInterupts();
        // 
        // Unload the Device Drivers?
        // More?
        //
        this.trace("end shutdown OS");
    },
    /**
     * This gets called from the host hardware sim every time there is a 
     * hardware clock pulse. This is NOT the same as a TIMER, which causes an 
     * interrupt and is handled like other interrupts. This, on the other hand, 
     * is the clock pulse from the hardware (or host) that tells the kernel 
     * that it has to look for interrupts and process them if it finds any.                          
     */
    onCPUClockPulse: function()
    {
        // Check for an interrupt, are any. Page 560
        if (_KernelInterruptQueue.getSize() > 0)
        {
            // Process the first interrupt on the interrupt queue.
            // TODO: Implement a priority queue based on the IRQ number/id to enforce interrupt priority.
            var interrupt = _KernelInterruptQueue.dequeue();
            this.interruptHandler(interrupt.irq, interrupt.params);
        }
        else if (_CPU.isExecuting) // If there are no interrupts then run one CPU cycle if there is anything being processed.
        {
            _CPU.cycle();
        }
        else                       // If there are no interrupts and there is nothing being executed then just be idle.
        {
            this.trace("Idle");
        }
    },
    /**
     * Enables Interupts
     */
    enableInterupts: function()
    {
        // Keyboard
        _Device.hostEnableKeyboardInterrupt();
        // Put more here.
    },
    /**
     * Disables Interupts
     */
    disableInterupts: function()
    {
        // Keyboard
        _Device.hostDisableKeyboardInterrupt();
        // Put more here.
    },
    /**
     * Handles all interupts
     */
    interruptHandler: function(irq, params)
    {
        // have support with perivous code
        var self = _Kernel;

        // Trace our entrance here so we can compute Interrupt Latency by analyzing the log file later on.  Page 766.
        self.trace("Handling IRQ~" + irq);

        // Invoke the requested Interrupt Service Routine via Switch/Case rather than an Interrupt Vector.
        // TODO: Consider using an Interrupt Vector in the future.
        // Note: There is no need to "dismiss" or acknowledge the interrupts in our design here.  
        //       Maybe the hardware simulation will grow to support/require that in the future.
        switch (irq)
        {
            case TIMER_IRQ:
                _Kernal.timerISR();                   // Kernel built-in routine for timers (not the clock).
                break;
            case KEYBOARD_IRQ:
                self.keyboardDriver.isr(params);   // Kernel mode device driver
                _StdIn.handleInput();
                break;
            case PROCESS_INITIATION_IRQ:
                self.processInitiationISR(params);
                break;
            case PROCESS_TERMINATION_IRQ:
                self.processTerminationISR(params);
                break;
            case CONTEXT_SWITCH_IRQ:
                self.contextSwitchISR(_CPU.scheduler.get("currentProcess"));
                break;
            case FSDD_CALL_IRQ:
                var routine = params[0];
                var args = params[1];
                self.fileSystemCall(routine, args);
                break;
            default:
                self.trapError("Invalid Interrupt Request. irq=" + irq + " params=[" + params + "]");
        }
    },
    /**
     * Initiates a process routine
     * @public
     * @method processInitiationISR
     * @param {jambOS.OS.ProcessControlBlock} pcb 
     */
    processInitiationISR: function(pcb) {
        _CPU.start(pcb);
    },
    /**
     * Terminates a process routine
     * @public
     * @method processTerminationISR
     * @param {jambOS.OS.ProcessControlBlock} pcb 
     */
    processTerminationISR: function(pcb) {
        var self = this;
        _CPU.stop();

        // Unload process
        self.processManager.unload(pcb);
    },
    /**
     * Switches what pracess is to be run next
     * @public
     * @method contextSwitchISR
     * @param {jambOS.OS.ProcessControlBlock} process 
     */
    contextSwitchISR: function(process) {
        var self = this;
        _CPU.scheduler.switchContext(process);
    },
    /**
     * Handles file system calls
     * @public
     * @method fileSystemCall
     * @param {int} routine
     * @param {array} params
     */
    fileSystemCall: function(routine, params) {
        _HardDrive.fileSystem.isr(routine, params);
    },
    /**
     * The built-in TIMER (not clock) Interrupt Service Routine (as opposed to an ISR coming from a device driver).
     */
    timerISR: function()
    {
        // Check multiprogramming parameters and enforce quanta here. Call the scheduler / context switch here if necessary.
    },
//
// System Calls... that generate software interrupts via tha Application Programming Interface library routines.
//
// Some ideas:
// - ReadConsole
// - WriteConsole
// - CreateProcess
// - ExitProcess
// - WaitForProcessToExit
// - CreateFile
// - OpenFile
// 
// - ReadFile
// - WriteFile
// - CloseFile


//
// OS Utility Routines
//
    trace: function(msg)
    {
        // Check globals to see if trace is set ON.  If so, then (maybe) log the message. 
        if (_Trace)
        {
            if (msg === "Idle")
            {
                // We can't log every idle clock pulse because it would lag the browser very quickly.
                if (_OSclock % 10 === 0)  // Check the CPU_CLOCK_INTERVAL in globals.js for an 
                {                        // idea of the tick rate and adjust this line accordingly.
                    _Control.hostLog(msg, "OS");
                }
            }
            else
            {
                _Control.hostLog(msg, "OS");
            }
        }
    },
    /**
     * This is our OS Error trap
     * @public
     * @method trapError
     */
    trapError: function(msg, killSwitch)
    {
        killSwitch = typeof killSwitch === "undefined" ? true : killSwitch;
        _Control.hostLog("OS ERROR - TRAP: " + msg);

        // Display error on console, perhaps in some sort of colored screen. (Perhaps blue?)
        var offset = _DrawingContext.measureText(_Console.currentFont, _Console.currentFontSize, ">");

        _Console.currentXPosition = offset;

        var xPos = _Console.currentXPosition;
        var yPos = (_Console.currentYPosition - _Console.currentFontSize) - 1;
        var width = 500;
        var height = _Console.currentFontSize + (_Console.currentFontSize / 2);

        // erase previous command
        _DrawingContext.clearRect(xPos, yPos, width, height);

        // print message on display in red    
        _DrawingContext.fillStyle = "red";
        _DrawingContext.font = "bold 12px Arial";
        _DrawingContext.fillText("OS ERROR: " + msg, xPos, _Console.currentYPosition);
        _Console.currentXPosition = _Canvas.width;
        _StdIn.advanceLine();
        _OsShell.putPrompt();

        if (killSwitch)
            this.shutdown();
    }

});
/**
 *==============================================================================
 * Class ProcessControlBlock
 *    
 * @class ProcessControlBlock
 * @memberOf jambOS.OS 
 * @param {object} - Array Object containing the default values to be 
 *                             passed to the class
 *==============================================================================
 */
jambOS.OS.ProcessControlBlock = jambOS.util.createClass(/** @scope jambOS.OS.ProcessControlBlock.prototype */ {
    /**
     * @property {int} pid                  - process id
     */
    pid: 0,
    /**
     * @property {int} pc                   - Program Counter
     */
    pc: 0,
    /**
     * @property {int} acc                  - Accumulator
     */
    acc: 0,
    /**
     * @property {int} xReg                 - X Register
     */
    xReg: 0,
    /**
     * @property {int} yReg                 - Y Register
     */
    yReg: 0,
    /**
     * @property {int} zFlag                - zero flag
     */
    zFlag: 0,
    /**
     * @property {int} priority             - Process Priority
     */
    priority: 0,
    /**
     * @property {array} slots              - Memory addresses in which the process is occupying
     */
    slots: [],
    /**
     * @property {string} state             - Process State (new, running, waiting, ready, terminated)
     */
    state: "new",
    /**
     * @property {int} slot                 - slot in which the process is loaded
     */
    slot: 0,
    /**
     * @property {int} base                 - Base for a process
     */
    base: 0,
    /**
     * @property {int} limit                - Memory limit for a process
     */
    limit: 0,
    /**
     * @property {int} programSize          - Size of program
     */
    programSize: 0,
    /**
     * Constructor
     * @param {object} options
     */
    initialize: function(options) {
        options || (options = {});
        this.setOptions(options);
    }
});
