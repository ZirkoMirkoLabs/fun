"""Exercise the actual FastMCP tools with the supported isolated SDK environment."""
import asyncio
import base64
import json
from pathlib import Path
import sys
from PIL import Image
from pixelsnap.mcp_server import create_server

out=Path(sys.argv[1] if len(sys.argv)>1 else 'G:/tmp/pixelsnap-effects-validation')
source=out/'source.png'

async def main():
    server=create_server(out, out/'mcp-output')
    names={t.name for t in await server.list_tools()}
    assert {'list_effects','preview_effect','apply_effect','validate_effect'} <= names
    reports=[]
    async def call(name, **kwargs):
        result=await server.call_tool(name,kwargs)
        # FastMCP returns (content, structured) for dicts, CallToolResult for images.
        if hasattr(result,'content'):
            content=result.content
            record=result.structuredContent or json.loads(content[0].text)
        elif isinstance(result,tuple): content,record=result
        else:
            content=result
            record=json.loads(content[0].text)
        reports.append({'tool':name,'status':record.get('status','ok')})
        return content,record
    _,catalog=await call('list_effects');assert len(catalog['effects'])==27
    recipe={'version':1,'name':'MCP emerald','fps':10,'duration':1,'loop':True,
            'layers':[{'effect':'pixel/tint','color':'#84f800','amount':.25},{'effect':'fire/torch','seed':7}]}
    _,valid=await call('validate_effect',recipe=recipe);assert valid['valid']
    _,snap=await call('snap_image',path='source.png',options={'cell':1,'offset_x':0,'offset_y':0})
    native=snap['results'][0]['outputs']['native']
    content,preview=await call('preview_effect',path=native,recipe=recipe,frame=6)
    assert preview['status']=='ok' and any(c.type=='image' for c in content)
    im=next(c for c in content if c.type=='image')
    assert base64.b64decode(im.data)==Path(preview['outputs']['png']).read_bytes()
    _,sheet=await call('apply_effect',path=native,recipe=recipe,format='sheet')
    assert sheet['status']=='ok' and len(json.loads(Path(sheet['outputs']['atlas']).read_text())['frames'])==10
    _,gif=await call('apply_effect',path=native,recipe=recipe,format='gif')
    assert Image.open(gif['outputs']['gif']).n_frames==10
    source_bytes=Image.open(native).convert('RGBA').tobytes()
    for effect in catalog['effects']:
        _,rendered=await call('apply_effect',path=native,effect=effect['id'])
        assert rendered['status']=='ok',rendered
        assert Image.open(rendered['outputs']['png']).convert('RGBA').tobytes()!=source_bytes,effect['id']
    _,bad=await call('apply_effect',path=str(out.parent/'forbidden.png'),effect='fire/torch')
    assert bad['status']=='error' and 'outside' in bad['error']
    _,bad=await call('apply_effect',path='source.png',recipe={**recipe,'code':'process.exit()'})
    assert bad['status']=='error' and 'Unknown recipe field' in bad['error']
    (out/'mcp-results.json').write_text(json.dumps({'calls':reports,'preview':preview,'sheet':sheet,'gif':gif},indent=2))
    print(f'PASS: {len(reports)} actual MCP calls; all 27 default PNG effects visibly change exact RGBA; snap -> preview image -> sheet/GIF; forbidden path and executable recipe rejected.')

if __name__ == '__main__':
    asyncio.run(main())
