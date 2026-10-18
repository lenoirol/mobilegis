"""Recovery safety checks. Fixtures are synthetic and never published as research."""
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
sys.path.insert(0,str(ROOT/'scripts'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from review_gee_recovery import (DESCRIPTIONS, NODATA, ROOT as PROJECT,
    TARGETS, features, merge_gaps, review, sha, validate_candidate, validate_diagnostics, validate_scenes, valid)


def scene():
    return dict(scene_index='1',LANDSAT_PRODUCT_ID='LC08_L2SP_125052_20250305_20250308_02_T1',
        acquisition_date='2025-03-05',day_of_year='64',year='2025',recovery_batch='1',resolution_m='120',
        CLOUD_COVER='10',tvdi_bins='8',tvdi_status='experimental_fit',
        wet_slope='-2',wet_intercept='30',dry_slope='-8',dry_intercept='45')


def diagnostics(baseline_scenes, candidate):
    rows=[]
    for item in [*baseline_scenes,candidate]:
        for code in sorted(TARGETS):
            rows.append(dict(code=code,LANDSAT_PRODUCT_ID=item['LANDSAT_PRODUCT_ID'],
                acquisition_date=item['acquisition_date'],year='2025',resolution_m='120',recovery_batch='1',
                role='candidate' if item is candidate else 'baseline',
                footprint='100',clear_qa='50',optical_valid='50',thermal_available='70',joint_valid='50'))
    return rows


class RecoveryTests(unittest.TestCase):
    def test_export_collection_does_not_mix_maskonly_placeholder(self):
        script=(ROOT/'scripts/gee_recover_2025.js').read_text(encoding='utf8')
        self.assertNotIn('ee.ImageCollection.fromImages([emptyImage])',script)
        self.assertIn('.updateMask(jointMask).toFloat()',script)
        self.assertIn("processed.sort('CLOUD_COVER', false).mosaic(), emptyImage)",script)

    def test_gap_merge_keeps_existing_partial_and_other_wards(self):
        base=np.full((3,2,3),NODATA,dtype='float32')
        base[:,0,0]=[.2,38,.5]
        base[0,0,1]=.3  # Partial baseline must not be overwritten.
        candidate=np.ones((5,2,3),dtype='float32')
        target=np.array([[True,True,True],[False,False,False]])
        output,filled=merge_gaps(base,candidate,target)
        self.assertEqual(int(filled.sum()),1)
        np.testing.assert_array_equal(output[valid(base)],base[valid(base)])
        np.testing.assert_array_equal(output[:,1],base[:,1])

    def test_scene_validation_blocks_other_year_date_duplicate_and_cloud(self):
        original=scene()
        validate_scenes([original],set(),1)
        for change in ({'acquisition_date':'2026-03-05'},{'day_of_year':'65'},
                       {'year':'2024'},{'CLOUD_COVER':'36'},{'tvdi_status':'insufficient_bins'}):
            with self.subTest(change=change),self.assertRaises(ValueError):
                validate_scenes([{**original,**change}],set(),1)
        with self.assertRaises(ValueError):validate_scenes([original,original],set(),1)
        with self.assertRaises(ValueError):validate_scenes([original],{original['LANDSAT_PRODUCT_ID']},1)

    def test_candidate_pairs_and_provenance(self):
        arr=np.array([.4,39,.6,1,64],dtype='float32').reshape(5,1,1)
        scenes=validate_scenes([scene()],set(),1)
        self.assertTrue(validate_candidate(arr,scenes).all())
        for band,value in ((0,2),(1,100),(2,1.1),(3,2),(4,65),(2,NODATA)):
            bad=arr.copy();bad[band,0,0]=value
            with self.subTest(band=band,value=value),self.assertRaises(ValueError):
                validate_candidate(bad,scenes)

    def test_zero_valid_candidate_is_not_published(self):
        base=np.full((3,2,2),NODATA,dtype='float32')
        _,filled=merge_gaps(base,np.full((5,2,2),NODATA,dtype='float32'),np.ones((2,2),bool))
        self.assertFalse(filled.any())

    def test_diagnostics_require_all_keys_and_valid_counts(self):
        baseline=[{**scene(),'LANDSAT_PRODUCT_ID':'LC08_L2SP_125052_20250204_20250208_02_T1',
                  'acquisition_date':'2025-02-04'}]
        current=scene();rows=diagnostics(baseline,current)
        ids={baseline[0]['LANDSAT_PRODUCT_ID']};scenes=validate_scenes([current],ids,1)
        validate_diagnostics(rows,ids,scenes,1)
        for bad in (rows[:-1],rows+[rows[0]], [{**rows[0],'joint_valid':'-1'}]+rows[1:]):
            with self.assertRaises(ValueError):validate_diagnostics(bad,ids,scenes,1)

    def test_full_review_is_separate_and_preserves_active_files(self):
        baseline=PROJECT/'data/gee/rasters/indices_2025_120m.tif'
        protected=[baseline,PROJECT/'public/data/gee/products.json',PROJECT/'public/data/gee/observations.json']
        hashes={p:sha(p) for p in protected}
        with rasterio.open(baseline) as ds:
            base=ds.read();profile=ds.profile.copy()
            targets=geometry_mask([transform_geom(4326,ds.crs,g) for code,_,g in features() if code in TARGETS],
                                 out_shape=ds.shape,transform=ds.transform,invert=True)
            eligible=np.flatnonzero((targets & (~valid(base)).all(axis=0)).ravel())[:20]
            self.assertEqual(len(eligible),20)
            arr=np.full((5,*ds.shape),NODATA,dtype='float32')
            arr.reshape(5,-1)[:,eligible]=np.array([.4,39,.6,1,64],dtype='float32')[:,None]
            profile.update(count=5)
        with tempfile.TemporaryDirectory(prefix='MobileGIS_recovery_test_') as temp:
            folder=Path(temp);prefix='MobileGIS_recovery_2025_batch1'
            with rasterio.open(folder/(prefix+'_120m.tif'),'w',**profile) as dst:
                dst.write(arr)
                for i,name in enumerate(DESCRIPTIONS,1):dst.set_band_description(i,name)
            row=scene()
            with (folder/(prefix+'_scenes.csv')).open('w',newline='',encoding='utf8') as f:
                writer=csv.DictWriter(f,fieldnames=list(row));writer.writeheader();writer.writerow(row)
            product=json.loads((PROJECT/'public/data/gee/products.json').read_text(encoding='utf8'))
            diag=diagnostics(product['audits']['2025']['scenes'],row)
            with (folder/(prefix+'_diagnostics.csv')).open('w',newline='',encoding='utf8') as f:
                writer=csv.DictWriter(f,fieldnames=list(diag[0]));writer.writeheader();writer.writerows(diag)
            output=folder/'separate_review'
            result=review(folder,output)
            self.assertEqual(result['filled_pixels'],20)
            self.assertEqual(result['status'],'review_only_not_published')
            self.assertEqual(len(result['wards']),5)
            self.assertEqual(len(json.loads((output/'observations_2025_review.json').read_text(encoding='utf8'))),167)
            with rasterio.open(output/'indices_2025_recovery_batch1_120m.tif') as ds:
                merged=ds.read()
                np.testing.assert_array_equal(merged[valid(base)],base[valid(base)])
                np.testing.assert_array_equal(merged[:,~targets],base[:,~targets])
            with self.assertRaises(ValueError):review(folder,output)
        self.assertEqual({p:sha(p) for p in protected},hashes)


class Batch2Tests(unittest.TestCase):
    """Batch 2 builds on the published batch-1 recovery. Candidates are synthetic; real files are only read."""
    targets_file=PROJECT/'verification/GEE_2025_batch2_targets.json'

    def test_gee_script_excludes_used_scenes_ranks_gaps_and_matches_target_list(self):
        script=(PROJECT/'scripts/gee_recover_2025_batch2.js').read_text(encoding='utf8')
        plan=json.loads(self.targets_file.read_text(encoding='utf8'))
        self.assertIn('var RECOVERY_BATCH = 2;',script)
        for scene_id in plan['already_used_scene_ids']:self.assertIn(scene_id,script)
        self.assertIn("filter(ee.Filter.inList('LANDSAT_PRODUCT_ID', USED_IDS).not())",script)
        self.assertIn('.updateMask(gap).clipToCollection(targets)',script)
        self.assertIn('diagnosticImages.toList(12)',script)
        listed=json.loads(script.split('var TARGET_CODES = ')[1].split(';')[0].replace("'",'"'))
        self.assertEqual(listed,plan['target_codes'])
        self.assertEqual(len(listed),len(set(listed)))
        self.assertNotIn('26732',listed)   # Côn Đảo stays excluded
        with (PROJECT/'data/gee_recovery/batch1_20261004/originals/MobileGIS_recovery_2025_batch1_scenes.csv').open(encoding='utf-8-sig') as handle:
            batch1=[r['LANDSAT_PRODUCT_ID'] for r in csv.DictReader(handle)]
        self.assertTrue(set(batch1)<=set(plan['already_used_scene_ids']))

    def test_batch2_requires_explicit_targets(self):
        with tempfile.TemporaryDirectory() as temp,self.assertRaises(ValueError):
            review(Path(temp),Path(temp)/'out',batch=2)

    def test_batch2_review_fills_only_gaps_keeps_batch1_and_offsets_provenance(self):
        plan=json.loads(self.targets_file.read_text(encoding='utf8'));codes=plan['target_codes'][:3]
        previous=PROJECT/'data/gee_recovery/batch1_20261004/indices_2025_recovery_batch1_120m.tif'
        previous_provenance=PROJECT/'data/gee_recovery/batch1_20261004/provenance_2025_120m.tif'
        protected=[previous,previous_provenance,PROJECT/'public/data/gee_recovery/products.json',PROJECT/'public/data/gee_recovery/observations.json']
        hashes={p:sha(p) for p in protected}
        with rasterio.open(previous) as ds, rasterio.open(previous_provenance) as pv:
            base=ds.read();prov_before=pv.read();profile=ds.profile.copy()
            mask=geometry_mask([transform_geom(4326,ds.crs,g) for code,_,g in features() if code in codes],out_shape=ds.shape,transform=ds.transform,invert=True)
            eligible=np.flatnonzero((mask & (~valid(base)).all(axis=0)).ravel())[:20]
            self.assertEqual(len(eligible),20)
            arr=np.full((5,*ds.shape),NODATA,dtype='float32')
            arr.reshape(5,-1)[:,eligible]=np.array([.4,39,.6,1,69],dtype='float32')[:,None]
            profile.update(count=5)
        row={**scene(),'LANDSAT_PRODUCT_ID':'LC09_L2SP_124052_20250310_20250312_02_T1','acquisition_date':'2025-03-10','day_of_year':'69','recovery_batch':'2'}
        product=json.loads((PROJECT/'public/data/gee_recovery/products.json').read_text(encoding='utf8'))
        old_scenes=product['audits']['2025']['scenes']
        self.assertGreaterEqual(len(old_scenes),8)   # 4 original + 4 batch-1 scenes are all excluded as candidates
        with tempfile.TemporaryDirectory(prefix='MobileGIS_recovery2_test_') as temp:
            folder=Path(temp);prefix='MobileGIS_recovery_2025_batch2'
            with rasterio.open(folder/(prefix+'_120m.tif'),'w',**profile) as dst:
                dst.write(arr)
                for i,name in enumerate(DESCRIPTIONS,1):dst.set_band_description(i,name)
            with (folder/(prefix+'_scenes.csv')).open('w',newline='',encoding='utf8') as f:
                writer=csv.DictWriter(f,fieldnames=list(row));writer.writeheader();writer.writerow(row)
            diag=[dict(code=code,LANDSAT_PRODUCT_ID=item['LANDSAT_PRODUCT_ID'],acquisition_date=item['acquisition_date'],year='2025',resolution_m='120',recovery_batch='2',
                       role='candidate' if item is row else 'baseline',footprint='100',clear_qa='50',optical_valid='50',thermal_available='70',joint_valid='50')
                  for item in [*old_scenes,row] for code in codes]
            with (folder/(prefix+'_diagnostics.csv')).open('w',newline='',encoding='utf8') as f:
                writer=csv.DictWriter(f,fieldnames=list(diag[0]));writer.writeheader();writer.writerows(diag)
            output=folder/'review2'
            result=review(folder,output,batch=2,targets=codes)
            self.assertEqual(result['filled_pixels'],20)
            self.assertEqual(result['scene_index_offset'],10)
            self.assertEqual(sorted(w['code'] for w in result['wards']),sorted(codes))
            with rasterio.open(output/'indices_2025_recovery_batch2_120m.tif') as ds:
                merged=ds.read()
                np.testing.assert_array_equal(merged[valid(base)],base[valid(base)])   # nothing from batch 1 changes
            with rasterio.open(output/'provenance_2025_120m.tif') as pv:
                prov=pv.read()
            flat=prov.reshape(2,-1)
            np.testing.assert_array_equal(flat[0,eligible],np.full(20,11,dtype='float32'))   # scene 1 + offset 10
            rest=np.ones(flat.shape[1],bool);rest[eligible]=False
            np.testing.assert_array_equal(prov.reshape(2,-1)[:,rest],prov_before.reshape(2,-1)[:,rest])  # earlier provenance untouched
        self.assertEqual({p:sha(p) for p in protected},hashes)


if __name__ == '__main__':unittest.main()
