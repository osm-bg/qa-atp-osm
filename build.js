import fs from 'fs';
import { caclulate_distance, drop_tags, calc_bbox, generate_metadata } from './utils.js';

import { fetch_all_osm_data } from './build_osm.js';
import { populate_atp_cache } from './build_atp.js';

function match_atp_to_osm(atp, osm_points, max_distance, match_by_ref) {
	if(match_by_ref && atp.tags.ref) {
		const ref = atp.tags.ref;
		const osm_index = osm_points.findIndex(osm => osm?.tags?.ref === ref);
		if(osm_index != -1) {
			const distance = caclulate_distance(atp, osm_points[osm_index]);
			if(distance > max_distance) {
				console.log(`[${atp.tags['@spider']}] Match by ref ${ref} found, but distance ${distance} is greater than max distance ${max_distance}`);
				return {index: -1};
			}
			return {index: osm_index, distance: distance};
		}
		else {
			console.log(`No match by ref ${ref}, ${typeof ref}`);
		}
	}
	else {
		const bbox = calc_bbox(atp.coordinates, max_distance);
		const distances = osm_points.map(osm => caclulate_distance(atp, osm, bbox));
		const closest_index = distances.indexOf(Math.min(...(distances)));
	
		if(closest_index != -1 && (distances[closest_index] != +Infinity || !max_distance)) {
			if(max_distance && distances[closest_index] > max_distance) {
				return {index: -1};
			}
			return {index: closest_index, distance: distances[closest_index]};
		}
	}
	return {index: -1};
}

function match_points(osm_points, atp_points, compare_keys, match_by_ref){
	let matches = [];

	const max_distance = /*shop.max_distance?shop.max_distance:*/configs.max_distance;

	atp_points.forEach((atp, index) => {
		matches.push({osm: false, atp: drop_tags(atp, true)});
	});

	if(match_by_ref) {
		console.log('Matching by ref');

	}

	let current_max_distance = 8;
	let has_unmatched_atp_points = true;
	let has_unmatched_osm_points = true;
	while(true) {
		has_unmatched_atp_points = matches.some(row => row.atp && !row.osm);
		has_unmatched_osm_points = osm_points.some(osm => osm);
		if(!has_unmatched_atp_points || !has_unmatched_osm_points || current_max_distance > max_distance) {
			break;
		}

		matches.forEach((row, index) => {
			if(row.osm) {
				return;
			}
			const match  = match_atp_to_osm(row.atp, osm_points, current_max_distance, false);
			if(match.index != -1){
				matches[index].dist = match.distance;
				matches[index].osm = drop_tags(osm_points[match.index]);
				osm_points[match.index] = false;
			}
		});
		current_max_distance *= 2;
	}

	for(const osm_point of osm_points) {
		if(osm_point) {
			matches.push({osm: drop_tags(osm_point), atp: false});
		}
	}
	
	return matches;
}

function save_results(matched_elements, metadata) {
	const data_for_saving = {
		metadata,
		items: matched_elements
	};
	const {key, value, spider_name} = metadata;
	const filename = `output/${key}-${value}-${spider_name}.json`;
	fs.writeFileSync(filename, JSON.stringify(data_for_saving));
}

const configs = JSON.parse(fs.readFileSync('config.json'));

async function start() {
	const today = new Date();
	if(!fs.existsSync('output')){
		fs.mkdirSync('output');
	}
	const spiders = JSON.parse(fs.readFileSync(`data.json`))
	.filter(({spider_name}) => 
		(configs.run_only.length === 0 || configs.run_only.includes(spider_name))
		&& !configs.skip.includes(spider_name)
	);

	let osm_data = await fetch_all_osm_data(spiders);
	let atp_cache = {};
	await populate_atp_cache(spiders, atp_cache);
	let metadata_list = [];
	for(const spider of spiders) {
		const {spider_name, osm} = spider;
		console.log(`Starting ${spider_name}`);
		for(const osm_item of osm) {
			const {key, value, wikidata, compare_keys, match_by_ref} = osm_item;
			const [wikidata_key, wikidata_value] = wikidata;

			const osm_points = osm_data.filter(osm_point => 
				osm_point.tags[key] === value &&
				osm_point.tags[`${wikidata_key}:wikidata`] === wikidata_value
			);
			const atp_points = atp_cache[spider_name].filter(atp_point => 
				atp_point.tags[key] === value &&
				atp_point.tags[`${wikidata_key}:wikidata`] === wikidata_value
			);
			
			const matched = match_points(osm_points, atp_points, compare_keys, match_by_ref);
			const metadata = generate_metadata({key, value, ...spider}, matched);
			save_results(matched, {compare_keys, date: today, ...metadata});
			metadata_list.push(metadata);
		}
		console.log(`Finished ${spider_name}`);
	}
	fs.writeFileSync(`output/metadata.json`, JSON.stringify({
		date: today,
		list: metadata_list
	}));
}
start();
