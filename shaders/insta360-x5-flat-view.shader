// X5 stitched panorama -> perspective. Disable Use Preset; select 2880x1440 at 30 FPS.
uniform string notes< string widget_type = "info"; > = "Requires stitched 2880x1440 input, not the High preset split-screen mode.";
uniform float Yaw< string widget_type = "slider"; float minimum = -180.0; float maximum = 180.0; float step = 0.1; > = 0.0;
uniform float Pitch< string widget_type = "slider"; float minimum = -180.0; float maximum = 180.0; float step = 0.1; > = 0.0;
uniform float Roll< string widget_type = "slider"; float minimum = -180.0; float maximum = 180.0; float step = 0.1; > = 0.0;
uniform float Field_Of_View< string widget_type = "slider"; float minimum = 40.0; float maximum = 130.0; float step = 0.1; > = 95.0;
sampler_state panoramaSampler {
    Filter = Linear;
    AddressU = Wrap;
    AddressV = Clamp;
};
float4 mainImage(VertData v_in) : TARGET
{
    float aspect = uv_size.x / max(uv_size.y, 1.0);
    float scale = tan(radians(Field_Of_View) * 0.5);
    float3 d = normalize(float3((v_in.uv.x-0.5)*2.0*scale*aspect,
                               (v_in.uv.y-0.5)*2.0*scale, 1.0));
    // Local roll, local pitch, then world yaw keeps tilt relative to heading.
    float r = radians(Roll), p = radians(Pitch), y = radians(Yaw);
    d = float3(d.x*cos(r)-d.y*sin(r), d.x*sin(r)+d.y*cos(r), d.z);
    d = float3(d.x, d.y*cos(p)-d.z*sin(p), d.y*sin(p)+d.z*cos(p));
    d = float3(d.x*cos(y)+d.z*sin(y), d.y, d.z*cos(y)-d.x*sin(y));
    float2 pano = float2(atan2(d.x,d.z)/6.28318530718+0.5,
                        asin(clamp(d.y,-1.0,1.0))/3.14159265359+0.5);
    return image.Sample(panoramaSampler, pano);
}
