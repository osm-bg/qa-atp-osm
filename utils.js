export function distance(a, b, bbox=false) {
	if(!a || !b) {
		return +Infinity;
	}

	a = a.coordinates;
	b = b.coordinates;

	if(bbox) {
		const lb_lat = Math.min(bbox[0][0], bbox[1][0]);
		const rb_lat = Math.max(bbox[0][0], bbox[1][0]);
		const is_lat_in_bbox = lb_lat <= a[0] && a[0] <= rb_lat;
		
		const lb_lon = Math.min(bbox[0][1], bbox[1][1]);
		const rb_lon = Math.max(bbox[0][1], bbox[1][1]);
		const is_lon_in_bbox = lb_lon <= a[1] && a[1] <= rb_lon;
		
		if(!is_lat_in_bbox || !is_lon_in_bbox) {
			return +Infinity;
		}
	}
	const rad_to_deg = Math.PI / 180;
	const earthRadius = 6371000; // Earth's radius in meters
	const dLat = (b[0] - a[0]) * rad_to_deg;
	const dLon = (b[1] - a[1]) * rad_to_deg;
	const a_ =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(a[0] * rad_to_deg) *
		Math.cos(b[0] * rad_to_deg) *
		Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c_ = 2 * Math.atan2(Math.sqrt(a_), Math.sqrt(1 - a_));
	const distance = +((earthRadius * c_).toFixed(3)); // Distance in meters
	return distance;
}

export function drop_tags(element, is_atp_point=false){
	if(element==undefined){
		return false;
	}
	const tags_to_drop = ['name', 'name:bg', 'name:en', 'brand:bg', 'brand:en', 'operator'];
	tags_to_drop.forEach(tag => {
		if(tag=='name' && is_atp_point){
			return;
		}
		if(element.tags && element.tags[tag]){
			delete element.tags[tag];
		}
	});
	if(is_atp_point) {
		drop_atp_tags(element);
	}
	return element;
}

function drop_atp_tags(element) {
	const tags_to_drop = ['@spider', 'nsi_id', '@source_uri', 'id'];
	tags_to_drop.forEach(tag => {
		if(element.tags && element.tags[tag]){
			delete element.tags[tag];
		}
	});
}

export function are_tags_mismatched(osm_tags, atp_tags, tags_to_compare){
	if(!tags_to_compare){
		return true;
	}
	return tags_to_compare.some(tag => {
		if(tag == 'fuel:*'){
			//const fuels_to_check = ['cng', 'lpg', 'octane_95', 'octane_98', 'octane_100', 'adblue', 'HGV_diesel', 'diesel'];
			var atp_fuels = Object.keys(atp_tags).filter(tag => tag.indexOf('fuel:')==0);
			var osm_fuels = Object.keys(osm_tags).filter(tag => tag.indexOf('fuel:')==0);
			var tags_to_remove = osm_fuels.filter(fuel => atp_fuels.indexOf(fuel)==-1);
			var tags_to_update = atp_fuels.filter(fuel => osm_fuels.indexOf(fuel)==-1 || osm_tags[fuel]!='yes');
			return tags_to_remove.length+tags_to_update.length>0;
		}
		let is_atp_void = atp_tags[tag]=='' || !atp_tags[tag];
		var missing_tag = osm_tags[tag]==undefined && atp_tags[tag];
		var wrong_tag_value = osm_tags[tag] !== atp_tags[tag];
		if(missing_tag || !is_atp_void && wrong_tag_value){
			return true;
		}
		return false;
	});
}

export function calc_bbox(coordinates, dist) {
	//const dist = 1 * configs.max_distance;
	const degree_in_meters = 111111;
	return [[
		coordinates[0]-dist/degree_in_meters,
		coordinates[1]-dist/(Math.cos(coordinates[0]*Math.PI)*degree_in_meters),
	], [
		coordinates[0]+dist/degree_in_meters,
		coordinates[1]+dist/(Math.cos(coordinates[0]*Math.PI)*degree_in_meters)
	]];
}

export function generate_metadata(matched_elements, osm_points, atp_points, brand) {
	const total_ATP_points = atp_points.length;
	const total_OSM_points = osm_points.length;
	return {
		stats: {
			atp: total_ATP_points,
			osm: total_OSM_points,
			tags_mismatches: matched_elements.filter(row => row.tags_mismatch).length,
			percent_atp_to_osm_matched: parseFloat((matched_elements.filter(row => row.atp && row.osm).length / total_ATP_points * 100).toFixed(1))
		},
		name: brand.name,
		spider: brand.spider,
		key: brand.key,
		value: brand.value,
		fuzzy_coords: brand.fuzzy_coords
	}
}