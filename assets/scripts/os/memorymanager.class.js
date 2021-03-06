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