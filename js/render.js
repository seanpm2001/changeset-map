var mapboxgl = require('mapbox-gl');
var getChangeset = require('./getChangeset');
var propsDiff = require('./propsDiff');
var config = require('./config');
var moment = require('moment');
var events = require('events').EventEmitter;
var turfBboxPolygon = require('@turf/bbox-polygon');
var featureCollection = require('@turf/helpers').featureCollection;
var cmap, map;

function render(container, id, options) {
    var changesetId = id;
    cmap = new events();

    container.style.width = options.width || '1000px';
    container.style.height = options.height || '500px';
    renderHTML(container);

    options = options || {};
    options.overpassBase = options.overpassBase || config.overpassBase;
    mapboxgl.accessToken = config.mapboxAccessToken;

    container.classList.add('cmap-loading');
    getChangeset(changesetId, options.overpassBase, function(err, result) {
        container.classList.remove('cmap-loading');
        if (err) return errorMessage(err.msg);


        document.querySelector('.cmap-layer-selector').style.display = 'block';
        document.querySelector('.cmap-sidebar-changeset').text = 'Changeset - ' + changesetId;
        document.querySelector('.cmap-sidebar-user').text = 'User - ' + result.changeset.user;
        var time = result.changeset.to ? result.changeset.to : result.changeset.from;
        document.querySelector('.cmap-sidebar-time').textContent = moment(time).format('MMMM Do YYYY, h:mm a');
        document.querySelector('.cmap-sidebar-user').href = 'https://openstreetmap.org/user/' + result.changeset.user;
        document.querySelector('.cmap-sidebar-changeset').href = 'https://openstreetmap.org/changeset/' + changesetId;
        document.querySelector('.cmap-sidebar').style.display = 'block';
        var bbox = result.changeset.bbox;
        var featureMap = result.featureMap;

        renderMap(false, result);

        var layersKey = {
            'added': [
            'added-line',
            'added-point'
            ],
            'modified': [
            'modified-old-line',
            'modified-old-point',
            'modified-new-line',
            'modified-new-point'
            ],
            'deleted': [
            'deleted-line',
            'deleted-point'
            ]
        };
        var selectedLayers = [
        'added-line',
        'added-point',
        'modified-old-line',
        'modified-old-point',
        'modified-new-line',
        'modified-new-point',
        'deleted-line',
        'deleted-point'
        ];
        var layerSelector = document.querySelector('.cmap-layer-selector');
        layerSelector.addEventListener('change', function(e) {
            var key = e.target.value;
            if (e.target.checked) {
                selectedLayers = selectedLayers.concat(layersKey[key]);
                layersKey[key].forEach(function(layer) {
                    map.setLayoutProperty(layer, 'visibility', 'visible');
                });
            } else {
                selectedLayers = selectedLayers.filter(function(layer) {
                    return !layer in layersKey[key];
                });
                layersKey[key].forEach(function(layer) {
                    map.setLayoutProperty(layer, 'visibility', 'none');
                });
            }
        });

        var baseLayerSelector = document.querySelector('.cmap-baselayer-selector');
        baseLayerSelector.addEventListener('change', function(e) {
            var layer = e.target.value;
            if (layer === 'satellite') {
                renderMap('mapbox://styles/rasagy/cizp6lsah00ct2snu6gi3p16q', result);
            }

            if (layer === 'dark') {
                renderMap('mapbox://styles/mapbox/dark-v9', result);
            }

            if (layer === 'streets') {
                renderMap('mapbox://styles/mapbox/streets-v9', result);
            }
        });

        cmap.on('selectFeature', function (geometryType, featureId) {
            if (geometryType && featureId) {
                selectFeature(map, featureMap[featureId][0], featureMap);
            }
        });

        cmap.on('clearFeature', function () {
            clearFeature(map);
        });
    });

    return cmap;
}

function elt(name, attributes) {
  var node = document.createElement(name);
  if (attributes) {
    for (var attr in attributes)
      if (attributes.hasOwnProperty(attr))
        node.setAttribute(attr, attributes[attr]);
}
for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i];
    if (typeof child == 'string')
      child = document.createTextNode(child);
  node.appendChild(child);
}
return node;
}

function renderHTML(container) {
  container.classList.add('cmap-container');

  var mapContainer = elt('div', { class: 'cmap-map' });
  container.appendChild(mapContainer);

  var diff = elt('div', { class: 'cmap-diff cmap-scroll-styled', style: 'display: none' });
  container.appendChild(diff);

  var sidebar = elt('div', { class: 'cmap-sidebar cmap-pad1', style: 'display: none'});
  sidebar.appendChild(
    elt('div', { class: 'cmap-fill-grey cmap-info'},
      elt('a', { class: 'cmap-sidebar-changeset' }),
      elt('br'),
      elt('a', { class: 'cmap-sidebar-user icon account' }),
      elt('br'),
      elt('span', { class: 'cmap-sidebar-time icon time'})
      )
    );
  sidebar.appendChild(
    elt('div', { class: 'cmap-layer-selector cmap-info cmap-fill-grey'},
      elt('ul', {},
        elt('li', {},
          elt('label', { for: 'cmap-layer-selector-added', class: 'cmap-noselect cmap-pointer' },
            elt('input', { type: 'checkbox', value: 'added', checked: true, id: 'cmap-layer-selector-added' }),
            'Added features',
            elt('span', { class: 'cmap-fr'},
              elt('span', { class: 'cmap-color-box added'}))
            )
          ),

        elt('li', {},
          elt('label', { for: 'cmap-layer-selector-modified', class: 'cmap-noselect cmap-pointer' },
            elt('input', { type: 'checkbox', value: 'modified', checked: true, id: 'cmap-layer-selector-modified' }),
            'Modified features',
            elt('span', { class: 'cmap-fr'},
              elt('span', { class: 'cmap-color-box modified-old'}),
              '→',
              elt('span', { class: 'cmap-color-box modified-new'})
              )
            )
          ),

        elt('li', {},
          elt('label', { for: 'cmap-layer-selector-deleted', class: 'cmap-noselect cmap-pointer' },
            elt('input', { type: 'checkbox', value: 'deleted', checked: true, id: 'cmap-layer-selector-deleted' }),
            'Deleted features',
            elt('span', { class: 'cmap-fr'},
              elt('span', { class: 'cmap-color-box deleted'}))
            )
          )
        )
      )
    );

  sidebar.appendChild(
    elt('div', { class: 'cmap-info cmap-baselayer-selector cmap-fill-grey'},
        elt('form', {},
          elt('input', { type: 'radio', value: 'satellite', checked: true, name: 'baselayer', id: 'cmap-baselayer-satellite' }),
          elt('label', { for: 'cmap-baselayer-satellite', class: 'cmap-noselect cmap-pointer' }, 'Satellite'),
          elt('input', { type: 'radio', value: 'streets', name: 'baselayer', id: 'cmap-baselayer-streets' }),
          elt('label', { for: 'cmap-baselayer-streets', class: 'cmap-noselect cmap-pointer' }, 'Streets'),
          elt('input', { type: 'radio', value: 'dark', name: 'baselayer', id: 'cmap-baselayer-dark' }),
          elt('label', { for: 'cmap-baselayer-dark', class: 'cmap-noselect cmap-pointer' }, 'Dark')
          )
        )
    );

  container.appendChild(sidebar);
}

function addMapLayers(baseLayer, result, bounds) {

    map.addSource('changeset', {
        'type': 'geojson',
        'data': result.geojson
    });

    map.addSource('bbox', {
        'type': 'geojson',
        'data': getBoundingBox(bounds)
    });

    map.addLayer({
        'id': 'bbox-line',
        'type': 'line',
        'source': 'bbox',
        'paint': {
            'line-color': '#A58CF2',
            'line-opacity': 0.75,
            'line-width': 2
        }
    });

    map.addLayer({
        'id': 'bg-line',
        'source': 'changeset',
        'type': 'line',
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': 'hsl(0, 0%, 10%)',
            'line-width': 12,
            'line-opacity': 0.5
        }
    });

    map.addLayer({
        'id': 'bg-point',
        'source': 'changeset',
        'type': 'circle',
        'paint': {
            'circle-color': 'hsl(0, 0%, 10%)',
            'circle-opacity': {
                'base': 1,
                'stops': [
                    [
                        8,
                        0.6
                    ],
                    [
                        16,
                        0.25
                    ]
                ]
            },
           'circle-radius': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        8
                    ],
                    [
                        16,
                        17
                    ]
                ]
            },
        }
    });

    map.addLayer({
        'id': 'highlight-line',
        'source': 'changeset',
        'type': 'line',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': 'hsl(0, 0%, 90%)',
            'line-opacity': 0.8,
            'line-width': 12
        },
        'filter': [
            '==', 'id', ''
        ]
    });

    map.addLayer({
        'id': 'highlight-point',
        'source': 'changeset',
        'type': 'circle',
        'paint': {
            'circle-color': 'hsl(0, 0%, 90%)',
            'circle-radius': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        8
                    ],
                    [
                        16,
                        16
                    ]
                ]
            },
            'circle-opacity': 0.8
        },
        'filter': [
            '==', 'id', ''
        ]
    });

    map.addLayer({
        'id': 'deleted-line',
        'source': 'changeset',
        'type': 'line',
        'paint': {
            'line-color': '#CC2C47',
            'line-width': {
                "base": 1,
                "stops": [
                    [
                        8,
                        4
                    ],
                    [
                        12,
                        8
                    ]
                ]
            },
            'line-dasharray': [
                0.1,
                0.1
            ],
            'line-opacity': 0.8
        },
        'filter': [
            '==', 'changeType', 'deletedNew'
        ]
    });

    map.addLayer({
        'id': 'modified-old-line',
        'source': 'changeset',
        'type': 'line',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#DB950A',
            'line-width': {
                'base': 1,
                'stops': [
                    [
                        8,
                        4
                    ],
                    [
                        12,
                        8
                    ]
                ]
            },
            'line-blur': {
                'base': 1,
                'stops': [
                    [
                        8,
                        0.25
                    ],
                    [
                        12,
                        0.5
                    ]
                ]
            },
            'line-opacity': 0.8
        },
        'filter': [
            '==', 'changeType', 'modifiedOld'
        ]
    });

    map.addLayer({
        'id': 'modified-new-line',
        'source': 'changeset',
        'type': 'line',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#E8E845',
            'line-width': {
                'base': 1,
                'stops': [
                    [
                        8,
                        1
                    ],
                    [
                        12,
                        3
                    ]
                ]
            },
            'line-opacity': 0.8
        },
        'filter': [
            '==', 'changeType', 'modifiedNew'
        ]
    });

    map.addLayer({
        'id': 'added-line',
        'source': 'changeset',
        'type': 'line',
        'interactive': true,
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#39DBC0',
            'line-width': {
                'base': 1,
                'stops': [
                    [
                        8,
                        1
                    ],
                    [
                        12,
                        2
                    ]
                ]
            },
            'line-opacity': 0.8
        },
        'filter': [
            '==', 'changeType', 'added'
        ]
    });

    map.addLayer({
        'id': 'deleted-point',
        'source': 'changeset',
        'type': 'circle',
        'paint': {
            'circle-color': '#CC2C47',
            'circle-radius': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        4
                    ],
                    [
                        16,
                        14
                    ]
                ]
            },
            'circle-opacity': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        0.25
                    ],
                    [
                        14,
                        0.5
                    ]
                ]
            },
            'circle-blur': 0,
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.75,
            'circle-stroke-color': '#CC2C47'
        },
        'filter': [
            '==', 'changeType', 'deletedNew'
        ]
    });

    map.addLayer({
        'id': 'modified-old-point',
        'source': 'changeset',
        'type': 'circle',
        'paint': {
            'circle-color': '#DB950A',
            'circle-opacity': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        0.5
                    ],
                    [
                        14,
                        0.75
                    ]
                ]
            },
            'circle-blur': 0.25,
            'circle-radius': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        3.5
                    ],
                    [
                        16,
                        13
                    ]
                ]
            },
        },
        'filter': [
            '==', 'changeType', 'modifiedOld'
        ]
    });

    map.addLayer({
        'id': 'modified-new-point',
        'source': 'changeset',
        'type': 'circle',
        'paint': {
            'circle-color': '#E8E845',
            'circle-opacity': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        0.25
                    ],
                    [
                        14,
                        0.75
                    ]
                ]
            },
            'circle-radius': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        2
                    ],
                    [
                        16,
                        7
                    ]
                ]
            },
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.9,
            'circle-stroke-color': '#E8E845'
        },
        'filter': [
            '==', 'changeType', 'modifiedNew'
        ]
    });

    map.addLayer({
        'id': 'added-point',
        'source': 'changeset',
        'type': 'circle',
        'paint': {
            'circle-color': '#39DBC0',
            'circle-opacity': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        0.3
                    ],
                    [
                        14,
                        0.75
                    ]
                ]
            },
            'circle-radius': {
                'base': 1.5,
                'stops': [
                    [
                        10,
                        1
                    ],
                    [
                        16,
                        5
                    ]
                ]
            },
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.9,
            'circle-stroke-color': '#39DBC0'
        },
        'filter': [
            '==', 'changeType', 'added'
        ]
    });


    map.on('click', function(e) {
        var x1y1 = [e.point.x - 5, e.point.y - 5];
        var x2y2 = [e.point.x + 5, e.point.y + 5];
        var features = map.queryRenderedFeatures([x1y1, x2y2], {
            'layers': [
                'added-line',
                'added-point',
                'modified-old-line',
                'modified-old-point',
                'modified-new-line',
                'modified-new-point',
                'deleted-line',
                'deleted-point'
            ]
        });

        if (features.length) {
            selectFeature(map, features[0], result.featureMap);
        } else {
            clearFeature(map);
        }
    });
}

function errorMessage(message) {
    message = message || 'An unexpected error occured';
    document.querySelector('.cmap-info').innerHTML = message;
    document.querySelector('.cmap-sidebar').style.display = 'block';
    document.querySelector('.cmap-layer-selector').style.display = 'none';

}

function displayDiff(id, featureMap) {
    var featuresWithId = featureMap[id];
    var propsArray = featuresWithId.map(function(f) {
        var props = Object.assign({}, f.properties, f.properties.tags);
        delete props.tags;
        delete props.relations;
        return props;
    });

    var diff = propsDiff(propsArray);
    var diffHTML = getDiffHTML(diff);

    document.querySelector('.cmap-diff').innerHTML = '';
    document.querySelector('.cmap-diff').appendChild(diffHTML);
    document.querySelector('.cmap-diff').style.display = 'block';
}

function clearDiff() {
    document.querySelector('.cmap-diff').innerHTML = '';
    document.querySelector('.cmap-diff').style.display = 'none';
}

function getDiffHTML(diff) {
    var isAddedFeature = diff['changeType'].added === 'added';

    var root = document.createElement('table');
    root.classList.add('cmap-diff-table');
    if (isAddedFeature) {
        root.style.width = '300px';
    }

    var types = ['added', 'unchanged', 'deleted', 'modifiedOld', 'modifiedNew'];
    for (var prop in diff) {
        var tr = document.createElement('tr');

        var th = document.createElement('th');
        th.textContent = prop;
        th.setAttribute('title', prop);
        tr.appendChild(th);

        types.forEach(function(type) {
            if (diff[prop].hasOwnProperty(type)) {
                if (type == "added" && !isAddedFeature) {
                  var empty = document.createElement('td');
                  empty.classList.add('diff-property');
                  empty.classList.add('cmap-scroll-styled');
                  empty.classList.add(type);

                  tr.appendChild(empty);
              }

              var td = document.createElement('td');
              td.classList.add('diff-property');
              td.classList.add('cmap-scroll-styled');
              td.classList.add(type);

              td.textContent = diff[prop][type];
              tr.appendChild(td);

              if (type == 'deleted') {
                  var empty = document.createElement('td');
                  empty.classList.add('diff-property');
                  empty.classList.add('cmap-scroll-styled');
                  empty.classList.add(type);

                  tr.appendChild(empty);
              }

              if (type == 'unchanged') {
                tr.appendChild(td.cloneNode(true));
            }
        }
    });

        root.appendChild(tr);
    }
    return root;
}

function highlightFeature(map, featureId) {
    map.setFilter('highlight-line', [
        '==', 'id', featureId
        ]);
    map.setFilter('highlight-point', [
        '==', 'id', featureId
        ]);
}

function clearHighlight(map) {
    map.setFilter('highlight-line', [
        '==', 'id', ''
        ]);
    map.setFilter('highlight-point', [
        '==', 'id', ''
        ]);
}

function selectFeature(map, feature, featureMap) {
  var featureId = feature.properties.id;
  var osmType = feature.properties.type;

  highlightFeature(map, featureId);
  displayDiff(featureId, featureMap);
  cmap.emit('featureChange', osmType, featureId);
}

function clearFeature(map) {
  clearHighlight(map);
  clearDiff();
  cmap.emit('featureChange', null, null);
}

function renderMap(baseLayer, result) {
    if (map) {
        map.remove();
    }

    var bounds = getBounds(result.changeset.bbox);

    map = new mapboxgl.Map({
        container: document.querySelector('.cmap-map'),
        style: baseLayer || 'mapbox://styles/rasagy/cizp6lsah00ct2snu6gi3p16q',
        center: bounds.getCenter(),
        zoom: 14,
        dragRotate: false,
        touchZoomRotate: false,
    });

    map.on('load', function() {
        map.fitBounds(bounds, {'linear': true, padding: 200});
        addMapLayers(map, result, bounds);
        cmap.emit('load');
    });
}

function getBounds(bbox) {
  var left = +bbox.left,
      right = +bbox.right,
      top = +bbox.top,
      bottom = +bbox.bottom;

  return new mapboxgl.LngLatBounds(
      new mapboxgl.LngLat(left, bottom),
      new mapboxgl.LngLat(right, top)
  );
}

function getBoundingBox(bounds) {
  var left = bounds.getWest(),
      right = bounds.getEast(),
      top = bounds.getNorth(),
      bottom = bounds.getSouth();

  var padX = 0;
  var padY = 0;
  if (! (left === -180 && right === 180 && top === 90 && bottom === -90)) {
      padX = Math.max((right - left) / 5, 0.0001);
      padY = Math.max((top - bottom) / 5, 0.0001);
  }

  var bboxPolygon = turfBboxPolygon([
    left - padX,
    bottom - padY,
    right + padX,
    top + padY
  ]);

  return featureCollection([bboxPolygon]);
}

window.changesetMap = module.exports = render;
