const _ = require('lodash');
const ObjectID = require('mongoose').Schema.Types.ObjectId;
const History = require('./diffHistoryModel');
const async = require('async');
const jsondiffpatch = require('jsondiffpatch').create();

const saveHistoryObject = function (history, callback) {
  history.save((err) => {
    if (err) {
      err.message = 'Mongo Error :' + err.message;
    }
    callback();
  });
};
function isInteger(value) {
  return /^\d+$/.test(value);
}

function ordinal_suffix_of(i) {
  i += 1;
  const j = i % 10;
  const k = i % 100;
  if (j === 1 && k !== 11) {
    return i + 'st';
  }
  if (j === 2 && k !== 12) {
    return i + 'nd';
  }
  if (j === 3 && k !== 13) {
    return i + 'rd';
  }
  return i + 'th';
}


function lookForCourseChanges(original, updated, diff) {
  if (diff.updatedAt.length === 1 && diff.content.duration[0] === 0) {
    return `New course with name ${diff.content.name[1].trim()} was created.\n`;
  } else if (diff.content && diff.content.name && diff.content.name.length === 2) {
    return `Course name was changed from ${diff.content.name[0].trim()} to ${diff.content.name[1].trim()}.\n`;
  } else if (diff.content && diff.content.description && diff.content.description.length === 2) {
    return `Course description was changed from ${diff.content.description[0].trim()} to ${diff.content.description[1].trim()}.\n`;
  }
  const sectionChanges = [];
  let sectionDiff = '';
  for (const section in diff.children) {
    console.log('section property is', section);
    if (section.startsWith('_') && diff.children[section][1] === 0 && diff.children[section][2] === 0) {
      sectionChanges.push(`Section at ${ordinal_suffix_of(parseInt(section))} position with name ${diff.children[section][0].content.name.trim()} was deleted.\n`);
    } else if (isInteger(section)) {
      const sectionChange = lookForSectionChanges(original, updated, diff.children[section], section);
      sectionChanges.push(sectionChange);
    }
  }
  for (const sectionChange of sectionChanges) {
    sectionDiff += '\n';
    sectionDiff += sectionChange;
  }
  return sectionDiff;
}

function lookForSectionChanges(original, updated, diff, index) {
  if (diff[0] && diff[0].content && diff[0].content.modelType === 'section') {
    return `New section added at ${ordinal_suffix_of(parseInt(index))} position with name ${diff[0].content.name.trim()}\n`;
  } else if (diff.content && diff.content.name && diff.content.name.length === 2) {
    return `Section name was changed from ${diff.content.name[0].trim()} to ${diff.content.name[1].trim()}.\n`;
  }
  const cardChanges = [];
  let cardDiff = `Changes made to ${ordinal_suffix_of(parseInt(index))} section with name ${updated.children[index].content.name.trim()}:\n`;
  for (const card in diff.children) {
    if (card.startsWith('_') && diff.children[card][1] === 0 && diff.children[card][2] === 0) {
      cardChanges.push(`Card at ${ordinal_suffix_of(parseInt(card.substr(1, card.length - 1)))} position with name ${diff.children[card][0].content.name.trim()} was deleted.\n`);
    } else if (isInteger(card)) {
      const cardChange = lookForCardChanges(original, updated, diff.children[card], card, index);

      console.log('section', cardChanges);
      cardChanges.push(cardChange);
    }
  }
  for (const cardChange of cardChanges) {
    cardDiff += cardChange;
  }
  return cardDiff;
}

function lookForCardChanges(original, updated, diff, index, sectionIndex) {
  if (diff[0] && diff[0].content && diff[0].content.modelType === 'card') {
    return `New Card with name ${diff[0].content.name.trim()} was created.\n`;
  }
  if (diff.content && diff.content.name && diff.content.name.length === 2) {
    console.log('card', index);
    return `Card at ${ordinal_suffix_of(parseInt(index))} position with name ${updated.children[sectionIndex].children[index].content.name.trim()} was updated.\n`;
  }
  return `Card at ${ordinal_suffix_of(parseInt(index))} position with name ${updated.children[sectionIndex].children[index].content.name.trim()} was updated.\n`;
}

function diffHistoryModelReason(original, updated, diff) {
    // look for course changes
  const courseChanges = lookForCourseChanges(original, updated, diff);
  return courseChanges.trim();
}

// do not process _id as mongoose can change _id property
function replacer(key, value) {
  // Filtering out properties
  if (key === '_id') {
    return undefined;
  }
  return value;
}

const saveDiffObject = function (currentObject, original, updated, user, reason, callback) {
  const diff = jsondiffpatch.diff(JSON.parse(JSON.stringify(original, replacer)),
        JSON.parse(JSON.stringify(updated, replacer)));
  if (diff) {
    History.findOne({ collectionName: currentObject.constructor.modelName, contentId: currentObject._id }).sort('-version').exec((err, lastHistory) => {
      if (err) {
        err.message = 'Mongo Error :' + err.message;
        return callback();
      }
      const _id = new ObjectID();
      const history = new History({
        _id,
        collectionName: currentObject.constructor.modelName,
        contentId: currentObject._id,
        contentIds: [currentObject._id],
        diff,
        original,
        updated,
        user,
        description: diffHistoryModelReason(original, updated, diff),
        actorId: new ObjectID(),
        action: 'updateOffer',
        version: lastHistory ? lastHistory.version + 1 : 0
      });
      saveHistoryObject(history, callback);
    });
  } else {
    callback();
  }
};

const saveDiffHistory = function (queryObject, currentObject, callback) {
  currentObject.constructor.findOne({ _id: currentObject._id }, (err, selfObject) => {
    if (selfObject) {
      let dbObject = {},
        updateParams;
      updateParams = queryObject._update.$set ? queryObject._update.$set : queryObject._update;
      Object.keys(updateParams).forEach((key) => {
        dbObject[key] = selfObject[key];
      });
      saveDiffObject(currentObject, dbObject, updateParams, queryObject.options.__user, queryObject.options.__reason, () => {
        callback();
      });
    }
  });
};

const saveDiffs = function (self, next) {
  const queryObject = self;
  queryObject.find(queryObject._conditions, (err, results) => {
    if (err) {
      err.message = 'Mongo Error :' + err.message;
      return next();
    }
    async.eachSeries(results, (result, callback) => {
      if (err) {
        err.message = 'Mongo Error :' + err.message;
        return next();
      }
      saveDiffHistory(queryObject, result, callback);
    }, () => next());
  });
};

const getVersion = function (model, id, version, callback) {
  model.findOne({ _id: id }, (err, latest) => {
    if (err) {
      console.error(err);
      return callback(err, null);
    }
    History.find({ collectionName: model.modelName, contentId: id, version: { $gte: parseInt(version, 10) } },
            { diff: 1, version: 1 }, { sort: '-version' }, (err, histories) => {
              if (err) {
                console.error(err);
                return callback(err, null);
              }
              const object = latest || {};
              async.each(histories, (history, eachCallback) => {
                jsondiffpatch.unpatch(object, history.diff);
                eachCallback();
              }, (err) => {
                if (err) {
                  console.error(err);
                  return callback(err, null);
                }
                callback(null, object);
              });
            });
  });
};

const getHistories = function (modelName, id, expandableFields, callback) {
  History.find({ collectionName: modelName, contentId: id }, (err, histories) => {
    if (err) {
      console.error(err);
      return callback(err, null);
    }
    async.map(histories, (history, mapCallback) => {
      const changedValues = [];
      const changedFields = [];
      for (const key in history.diff) {
        if (history.diff.hasOwnProperty(key)) {
          if (expandableFields.indexOf(key) > -1) {
                        // var oldDate = new Date(history.diff[key][0]);
                        // var newDate = new Date(history.diff[key][1]);
                        // if (oldDate != "Invalid Date" && newDate != "Invalid Date") {
                        //    oldValue = oldDate.getFullYear() + "-" + (oldDate.getMonth() + 1) + "-" + oldDate.getDate();
                        //    newValue = newDate.getFullYear() + "-" + (newDate.getMonth() + 1) + "-" + newDate.getDate();
                        // }
                        // else {
            const oldValue = history.diff[key][0];
            const newValue = history.diff[key][1];
                        // }
            changedValues.push(key + ' from ' + oldValue + ' to ' + newValue);
          } else {
            changedFields.push(key);
          }
        }
      }
      const comment = 'modified ' + changedFields.concat(changedValues).join(', ');
      return mapCallback(null, {
        changedBy: history.user,
        changedAt: history.createdAt,
        updatedAt: history.updatedAt,
        description: history.description,
        comment
      });
    }, (err, output) => {
      if (err) {
        console.error(err);
        return callback(err, null);
      }
      return callback(null, output);
    });
  });
};

const plugin = function lastModifiedPlugin(schema, options) {
  schema.pre('save', function (next) {
    const self = this;
    if (self.isNew) {
      next();
    } else {
      self.constructor.findOne({ _id: self._id }, (err, original) => {
        saveDiffObject(self, original, self, self.__user, self.__reason, () => {
          next();
        });
      });
    }
  });

  schema.pre('findOneAndUpdate', function (next) {
    saveDiffs(this, () => {
      next();
    });
  });

  schema.pre('update', function (next) {
    saveDiffs(this, () => {
      next();
    });
  });

  schema.pre('remove', function (next) {
    saveDiffObject(this, this, {}, this.__user, this.__reason, () => {
      next();
    });
  });
};

module.exports.plugin = plugin;
module.exports.getHistories = getHistories;
module.exports.getVersion = getVersion;
