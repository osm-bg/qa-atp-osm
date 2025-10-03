import fs from 'fs';
import { distance, drop_tags, are_tags_mismatched, calc_bbox, generate_metadata } from './utils.js';

import { fetch_all_osm_data } from './build_osm.js';
import { populate_atp_cache } from './build_atp.js';

function match_atp_to_osm(osm, atp_points, max_distance){
	const bbox = calc_bbox(osm.coordinates, max_distance);
	const distances = atp_points.map(atp => distance(atp, osm, bbox));
	const closest_index = distances.indexOf(Math.min(...(distances)));

	if(closest_index != -1 && (distances[closest_index] != +Infinity || !max_distance)) {
		return {index: closest_index, distance: distances[closest_index]};
	}
	return {index: -1};
}

function process(/*shop,*/ osm_points, atp_points, compare_keys){
	let result = [];

	const max_distance = /*shop.max_distance?shop.max_distance:*/configs.max_distance;

	osm_points.forEach((osm) => {
		const match = match_atp_to_osm(osm, atp_points, max_distance);
		var temp = {osm: drop_tags(osm), atp: false};

		if(match.index != -1){
			temp.dist = match.distance;
			temp.atp = drop_tags(atp_points[match.index]);
			atp_points[match.index] = false;
			if(temp.atp==[]){
				temp.atp = false;
			}
		}
		result.push(temp);
	});
	// match anything left, if fuzzy coords
	// if(shop.fuzzy_coords){
	// 	result.forEach((row, index) => {
	// 		if(!row.atp && atp_points.length>0){
	// 			//const distances = atp_points.map(atp=>valid_point(atp, item.key, item.value)?distance(atp.coordinates, row.osm.coordinates):+Infinity);
	// 			const match = match_atp_to_osm(row.osm, atp_points);
	// 			result[index].atp = drop_tags(atp_points.splice(match.index, 1)[0], true)
	// 			result.fuzzy = true;
	// 			result.dist = match.distance;
	// 		}
	// 	});
	// }
	
	result.forEach(row => {
		if(!row.osm || !row.atp){
			row.tags_mismatch = false;
			return;
		}
		const osm_tags = row.osm ? row.osm.tags : [];
		const atp_tags = row.atp ? row.atp.tags : [];
		row.tags_mismatch = are_tags_mismatched(osm_tags, atp_tags, compare_keys);
	});

	atp_points.forEach(point => {
		result.push({osm: false, atp: drop_tags(point, true), tags_mismatch: false, dist: 0});
	});
	return result;
}

function save_result(data, {key, value, spider, compare_keys, name}) {
	const data_for_saving = {
		metadata: {
			name,
			key,
			value,
			compare_keys
		},
		data
	};
	const filename = `output/${key}_${value}_${spider}.json`;
	fs.writeFileSync(filename, JSON.stringify(data_for_saving));
}

function find_relevant_osm_points(osm_points, key, value, wikidata) {
	return osm_points.filter(item =>
		item.tags[key] === value
		&& 
		(
			typeof wikidata === 'object' && typeof wikidata[0] === 'object' && wikidata.some(([type, wikidata]) => item.tags[`${type}:wikidata`] === wikidata)
			|| typeof wikidata === 'object' && typeof wikidata[0] !== 'object' && item.tags[`${wikidata[0]}:wikidata`] === wikidata[1]
		)
	);
}

const configs = JSON.parse(fs.readFileSync('config.json'));

async function start() {
	if(!fs.existsSync('output')){
		fs.mkdirSync('output');
	}
	const spiders = JSON.parse(fs.readFileSync(`data.json`))
	.filter(spider => !configs.debug || configs.debug && configs.run_only.includes(spider.atp_spider));

	let overpass_pairs = [];
	for(const spider of spiders) {
		for(const item of spider.osm) {
			const {key, value} = item;
			if(typeof item.wikidata === 'object' && typeof item.wikidata[0] === 'object') {
				for(const [type, wikidata] of item.wikidata) {
					overpass_pairs.push({key, value, wikidata, type});
				}
			}
			else {
				const [type, wikidata] = item.wikidata;
				overpass_pairs.push({key, value, wikidata, type});
			}
		}
	}

	let osm_data = await fetch_all_osm_data(overpass_pairs);
	let atp_cache = {};
	await populate_atp_cache(spiders, atp_cache);
	let stats = [];
	for(const {atp_spider, osm, name} of spiders) {
		console.log(`Starting ${atp_spider}`);
		for(const osm_item of osm) {
			const atp_points = atp_cache[atp_spider];
			const relevant_atp_points = atp_points.filter(point => point.tags[osm_item.key] === osm_item.value);

			const osm_points = find_relevant_osm_points(osm_data, osm_item.key, osm_item.value, osm_item.wikidata);
			if(relevant_atp_points.length === 0 || osm_points.length === 0) {
				continue;
			}
			const matched_elements = process(osm_points, relevant_atp_points, osm_item.compare_keys);
			save_result(matched_elements, {key: osm_item.key, value: osm_item.value, spider: atp_spider, compare_keys: osm_item.compare_keys, name});
			const metadata = generate_metadata(matched_elements, osm_points, relevant_atp_points, {name, spider: atp_spider, key: osm_item.key, value: osm_item.value, compare_keys: osm_item.compare_keys});
			stats.push(metadata);
		}
		console.log(`Finished ${atp_spider}`);
	}
	fs.writeFileSync(`output/metadata.json`, JSON.stringify(stats));
}
start();
