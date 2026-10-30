import io
import base64
from PIL import Image
from pixelsnap.app import create_app


def test_upload_and_real_png_payloads():
    client=create_app().test_client()
    im=Image.new('RGB',(24,24),'#ea7845')
    buf=io.BytesIO();im.save(buf,format='PNG');buf.seek(0)
    response=client.post('/api/process',data={'image':(buf,'art.png'),'cell':'3','scale':'4','colors':'4'})
    assert response.status_code==200
    data=response.get_json()
    assert data['metadata']['native_size']==[8,8]
    for key,size in [('native',(8,8)),('upscaled',(32,32))]:
        png=Image.open(io.BytesIO(base64.b64decode(data[key].split(',')[1])))
        assert png.size==size
        assert png.format=='PNG'


def test_upload_validation_and_local_only():
    client=create_app().test_client()
    assert client.post('/api/process').status_code==400
    assert client.get('/api/health',headers={'Host':'attacker.example'}).status_code==403
    assert client.post('/api/process',headers={'Origin':'https://example.com'}).status_code==403
    response=client.post('/api/process',data={'image':(io.BytesIO(b'not an image'),'bad.png')})
    assert response.status_code==400
