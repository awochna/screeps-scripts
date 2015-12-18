var creeps = Game.creeps;
var spawn = Game.spawns.Spawn1;
var sources = spawn.room.find(FIND_SOURCES);
var damagedBuildings = spawn.room.find(FIND_STRUCTURES, {
    filter: function (object) {
        return object.hits < object.hitsMax;
    }
});
var parts = {
    'builder': [WORK, CARRY, MOVE, MOVE],
    'healer': [HEAL, MOVE],
    'guard': [TOUGH, TOUGH, RANGED_ATTACK, MOVE, MOVE],
    'harvester': [WORK, CARRY, MOVE, MOVE],
    'upgrader': [WORK, CARRY, MOVE, MOVE]
}
var creepQueue = ['harvester', 'harvester', 'builder', 'harvester', 'upgrader', 'harvester', 'guard', 'guard'];

Spawn.prototype.spawnNextCreep = function () {
    if (countHarvesters() > 3) {
        var role = creepQueue[Memory.creepPointer];
    } else {
        var defaultHarvester = true
        var role = 'harvester';
    }
    if (this.canCreateCreep(parts[role]) == OK) {
        this.createCreep(parts[role], {role: role, target: sources[0].id});
        if (!defaultHarvester) {
            Memory.creepPointer ++;
            if (Memory.creepPointer == creepQueue.length) {
                Memory.creepPointer = 0;
            }
        }
    }
};

Creep.prototype.harvestTargetSource = function () {
    if (!this.memory.target) {
        this.memory.target = this.room.find(FIND_SOURCES)[1].id;
    }
    var target = this.memory.target;
    var source = this.room.find(FIND_SOURCES, {
        filter: function(object) {
            return object.id == target;
        }
    })[0];
    if (this.harvest(source) == ERR_NOT_IN_RANGE) {
        if (this.pos.getRangeTo(source) < 4) {
            this.memory.path = null;
            if (this.moveTo(source) == ERR_NO_PATH) {
               this.findNewTargetSource();
            }
        } else if (this.memory.path) {
            if (this.moveByPath(this.memory.path) == ERR_NOT_FOUND) {
                this.memory.path = null;
            }
        } else {
            this.makePathToTarget(source);
        }
    } else {
        this.memory.path = null;
    }
};

Creep.prototype.findNewTargetSource = function () {
    var memory = this.memory;
    var source = this.room.find(FIND_SOURCES, {
        filter: function(object) {
            return object.id != memory.target;
        }
    })[0];
    memory.target = source.id;
};

Creep.prototype.pathTrace = function (target) {
    if (this.pos.getRangeTo(target) < 4) {
        this.moveTo(target);
        this.memory.path = null;
    } else if (this.memory.path) {
        if (this.moveByPath(this.memory.path) == ERR_NOT_FOUND) {
            this.memory.path = null;
        }
    } else {
        creep.makePathToTarget(target);
    }
};

Creep.prototype.makePathToTarget = function (target) {
    if (!Memory.pathCache[this.pos]) {
        Memory.pathCache[this.pos] = {};
    }
    if (Memory.pathCache[this.pos][target.id] != undefined) {
        this.memory.path = Memory.pathCache[this.pos][target.id];
        this.moveByPath(this.memory.path);
    } else {
        var path = this.room.findPath(this.pos, target.pos);
        Memory.pathCache[this.pos][target.id] = Room.serializePath(path);
        this.memory.path = Memory.pathCache[this.pos][target.id];
        this.moveByPath(this.memory.path);
    }
    this.memory.lastPos = this.pos;
};

if (!Memory.pathCache) {
    Memory.pathCache = {};
}

pruneMemoryCreeps();

for (var name in Game.spawns) {
    var spawn = Game.spawns[name];
    spawn.spawnNextCreep();
}

for (var name in creeps) {
    var creep = creeps[name];
    if (creep.memory.role == 'harvester') {
        harvester(creep);
    }
    if (creep.memory.role == 'builder') {
        builder(creep);
    }
    if (creep.memory.role == 'upgrader') {
        upgrader(creep);
    }
    if (creep.memory.role == 'guard') {
        guarder(creep);
    }
    if (creep.memory.role == 'healer') {
        healer(creep);
    }
}

function countHarvesters () {
    var count = 0;
    for (var name in creeps) {
        if (creeps[name].memory.role == 'harvester') {
            count ++;
        }
    }
    return count;
}

function pruneMemoryCreeps () {
    for (var id in Memory.creeps) {
        if (!Game.creeps[id]) {
            delete Memory.creeps[id];
        }
    }
}

function findEmptyExtensions () {
    var empties = [];
    for(var id in Game.structures) {
        var structure = Game.structures[id];
        if (structure.structureType == STRUCTURE_EXTENSION && structure.energy < structure.energyCapacity) {
            empties.push(structure);
        }
    }
    return empties;
}

function harvester (creep) {
    if (creep.carry.energy < creep.carryCapacity) {
        creep.harvestTargetSource();
    } else {
        var empties = findEmptyExtensions();
        if (empties.length) {
            var target = empties[0];
        } else {
            var target = spawn;
        }
        if (creep.transferEnergy(target) == ERR_NOT_IN_RANGE) {
            creep.pathTrace(target);
        } else {
            creep.memory.path = null;
        }
    }
}

function builder (creep) {
    determineTask(creep);
    performTask(creep);
}

function determineTask (creep) {
    if (creep.memory.task == undefined) {
        creep.memory.task = 'building';
    }
    if (creep.carry.energy == 0) {
        if (spawn.energy < 100) {
            creep.memory.task = 'harvesting';
        } else {
            creep.memory.task = 'retrieving';
        }
    }
    if (creep.carry.energy == creep.carryCapacity) {
//        if (damagedBuildings.length) {
//            creep.memory.task = 'repairing';
//        } else {
            creep.memory.task = 'building';
//        }
    }
}

function performTask (creep) {
    if (creep.memory.task == 'harvesting') {
        harvester(creep);
    } else if (creep.memory.task == 'retrieving') {
        if (spawn.transferEnergy(creep) == ERR_NOT_IN_RANGE) {
            creep.pathTrace(spawn);
        } else {
            creep.memory.path = null;
        }
    } else if (creep.memory.task == 'building') {
        var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
        if (targets.length) {
            var target = targets[0];
            if (creep.build(target) == ERR_NOT_IN_RANGE) {
                creep.pathTrace(target);
            } else {
                creep.memory.path = null;
            }
        } else {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.pathTrace(creep.room.controller);
            } else {
                creep.memory.path = null;
            }
        }
    } else if (creep.memory.task == 'repairing') {
        var target = damagedBuildings[0];
        if (creep.repair(target) == ERR_NOT_IN_RANGE) {
            creep.pathTrace(target);
        } else {
            creep.memory.path = null;
        }
    }
}

function upgrader (creep) {
    if (creep.carry.energy == 0) {
        if (spawn.transferEnergy(creep) == ERR_NOT_IN_RANGE) {
            creep.pathTrace(spawn);
        } else {
            creep.memory.path = null;
        }
    } else {
        var target = creep.room.controller
        if (creep.upgradeController(target) == ERR_NOT_IN_RANGE) {
            creep.pathTrace(target);
        } else {
            creep.memory.path = null;
        }
    }
}

function guarder (creep) {
    var targets = creep.room.find(FIND_HOSTILE_CREEPS);
    if (targets.length) {
        if (creep.rangedAttack(targets[0]) == ERR_NOT_IN_RANGE) {
            creep.moveTo(targets[0]);
        }
    } else {
        creep.moveTo(Game.flags.Guard);
    }
}

function healer (creep) {
    var targets = [];
    for (var name in creeps) {
        var target = creeps[name];
        if (target.hits < target.hitsMax) {
            targets.push(target);
        }
    }
    if (creep.heal(targets[0]) == ERR_NOT_IN_RANGE) {
        creep.moveTo(targets[0]);
    }
}
