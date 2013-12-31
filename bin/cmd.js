#!/usr/bin/env node

var fs = require('fs');
var through = require('through');

var minimist = require('minimist');
var argv = minimist(process.argv.slice(2), {
    boolean: [ 'q', 'stdout', 't', 'c' ],
    alias: { o: 'output', q: 'quiet', t: 'total', c: 'color' },
    default: { q: false, t: true, c: process.stderr.isTTY }
});

var vargv = minimist(process.argv.slice(2));
if (argv.q && (vargv.total === undefined && vargv.t === undefined)) {
    argv.total = argv.t = false;
}

if (argv.h || argv.help) {
    fs.createReadStream(__dirname + '/usage.txt').pipe(process.stdout);
    return;
}

var parse = require('../parse.js');

var output = process.stderr;
if (argv.o === '-' || argv.o === '@1') {
    output = process.stdout;
}
else if (argv.o && argv.o !== '@2') {
    output = fs.createWriteStream(argv.o);
}
else if (argv.o === undefined && argv.q) {
    output = process.stdout;
}

var covered = true;
process.on('exit', function (code) {
    if (!covered && code === 0) process.exit(1);
});

var parser = parse(function (err, sources, counts) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    else if (argv.json) {
        return output.write(JSON.stringify(sources, null, 2) + '\n');
    }
    else {
        var total = { expr: 0, total: 0 };
        Object.keys(counts).forEach(function (file) {
            total.expr += counts[file].expr;
            total.total += counts[file].total;
        });
        
        Object.keys(sources).forEach(function (file) {
            if (sources[file].length === 0) return;
            
            var lines = {};
            sources[file].forEach(function (m) {
                covered = false;
                if (!lines[m.line]) lines[m.line] = [];
                lines[m.line].push(m);
            });
            
            Object.keys(lines).forEach(function (ix) {
                var line = lines[ix];
                var parts = [];
                var column = 0;
                var str;
                
                line.forEach(function (m) {
                    m.lines.forEach(function (row, ix) {
                        str = row.line;
                        var r = row.range;
                        
                        if (ix > 0) parts.push('\n');
                        
                        parts.push(str.slice(column, r[0] + 1));
                        if (argv.color) parts.push('\x1b[31m\x1b[1m');
                        parts.push(str.slice(r[0] + 1, r[1] + 1));
                        if (argv.color) parts.push('\x1b[0m');
                        
                        column = r[1] + 1;
                    });
                });
                parts.push(str.slice(column));
                
                var m = line[0];
                var s = parts.join('');
                output.write(
                    '# ' + file
                    + ': line ' + (m.lineNum + 1)
                    + ', column ' + line.map(function (m) {
                        return (m.column[0] + 2) + '-' + m.column[1];
                    }).join(', ')
                    + '\n\n'
                );
                output.write('  ' + s.trim() + '\n');
                
                var xxx = m.line.replace(/\S/g, 'x');
                var xparts = [];
                var xindex = 0;
                
                line.forEach(function (m) {
                    xparts.push(xxx.slice(xindex, m.column[0] + 1));
                    xparts.push(Array(m.column[1] - m.column[0]).join('^'));
                    xindex = m.column[1];
                });
                
                var sx = xparts.join('').trim().replace(/x/g, ' ');
                output.write('  ' + sx + '\n\n');
            });
        });
        
        if (argv.total) {
            var p = percent(total.expr, total.total);
            output.write(
                '# coverage: '
                + total.expr + '/' + total.total
                + ' (' + colorify(p) + ' %)\n\n'
            );
        }
    }
});

if (argv.stdout || !argv.q || (vargv.q === undefined && argv.json)) {
    parser.pipe(process.stdout);
}
process.stdin.pipe(parser);

function percent (x, total) {
    if (total === 0) return '0.00';
    var s = String(Math.floor(x / total * 100 * 100) / 100);
    if (!/\./.test(s)) s += '.';
    return s + Array(2 - s.split('.')[1].length + 1).join('0');
}

function colorify (p) {
    if (argv.color === false) return p;
    var c = p === '100.00'
        ? '\x1b[32m\x1b[1m'
        : '\x1b[31m\x1b[1m'
    ;
    return c + p + '\x1b[0m';
}
