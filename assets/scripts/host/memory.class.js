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
     * @property {array} storage
     */
    storage: new Array(),
    /**
     * Constructor
     */
    initialize: function() {

        var self = this;
        var cols = 8;
        var rows = TOTAL_MEMORY / cols;

        // initialize storage memory array with zeros
        for (var i = 0; i < rows; i++) {
            this.storage[i] = new Array();
            for (var j = 0; j < cols; j++) {
                var address = [i, j];
                self.write(address, 00);
            }
        }

        self.updateMemoryDisplay();
    },
    /**
     * Reads data from storage
     * @param {string} address
     * @returns data
     */
    read: function(address) {
        var row = address[0];
        var col = address[1];
        return this.storage[row][col];
    },
    /**
     * Writes to storage
     * 
     * @public
     * @param {string} address
     * @param {object} data
     */
    write: function(address, data) {
        var row = address[0];
        var col = address[1];
        this.storage[row][col] = data;
    },
    /**
     * Updates content that is on memory for display on the OS
     * 
     * @public
     * @method updateDisplay
     */
    updateMemoryDisplay: function() {
        var self = this;
        var cols = 8;
        var rows = TOTAL_MEMORY / cols;

        var table = "<table>";

        for (var i = 0; i < rows; i++) {
            table += "<tr class='" + (self.read([i, 0]) !== 0 ? "has-value" : "") + "'>";
            table += "<td>0x" + self._decimalToHex((8 * (i+1)) - 8, 4) + "</td>";
            for (var j = 0; j < cols; j++) {
                table += "<td>" + self.read([i, j]) + "</td>";
            }
            table += "</tr>";
        }
        table += "</table>";

        // add to the memory div
        $("#memory .content").html(table);
    },
    /**
     * Converts decimal values to hex
     * 
     * @private
     * @method _decimalToHex
     * @param {Number} d
     * @param {int} padding
     * @returns {string} hex
     */
    _decimalToHex: function(d, padding) {
        var hex = Number(d).toString(16);
        padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

        while (hex.length < padding) {
            hex = "0" + hex;
        }

        return hex.toUpperCase();
    }
});